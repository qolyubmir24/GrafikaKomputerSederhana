const canvas = document.querySelector("#myCanvas");
const ctx = canvas.getContext("2d");
const toolBtns = document.querySelectorAll(".option");
const sizeSlider = document.querySelector("#line-width");
const lineTypeSelect = document.querySelector("#line-type");
const colorPicker = document.querySelector("#color-picker");
const clearCanvasBtn = document.querySelector(".clear-canvas");

let shapes = [];
let currentShape = null;
let selectedShape = null;

let isDrawing = false;
let selectedTool = "tool-brush";

// Variabel Mode Interaksi Pointer
let interactionMode = null; // 'move', 'scale', 'rotate', null
let startX, startY;
let initialAngle = 0;
let initialScale = 1;

window.addEventListener("load", () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    redrawCanvas();
});

// Mencari titik pusat (Centroid) dari sebuah objek
const calculateCenter = (shape) => {
    if (shape.type === "circle") {
        return { cx: shape.x, cy: shape.y };
    } else if (shape.type === "line") {
        return { cx: (shape.startX + shape.endX) / 2, cy: (shape.startY + shape.endY) / 2 };
    } else if (shape.type === "brush") {
        let minX = Math.min(...shape.points.map(p => p.x));
        let maxX = Math.max(...shape.points.map(p => p.x));
        let minY = Math.min(...shape.points.map(p => p.y));
        let maxY = Math.max(...shape.points.map(p => p.y));
        return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }
    return { cx: 0, cy: 0 };
};

const redrawCanvas = () => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render semua bentuk
    shapes.forEach(shape => drawShape(shape));
    if (currentShape) drawShape(currentShape);

    // Jika ada bentuk yang dipilih, render Kotak Pembatas (Bounding Box) dan Handle-nya
    if (selectedShape && selectedTool === "tool-select") {
        drawBoundingBox(selectedShape);
    }
};

const drawShape = (shape) => {
    ctx.save(); // Simpan state kanvas asli
    
    // Terapkan Transformasi Matriks (Modul 07 & 08)
    const center = calculateCenter(shape);
    ctx.translate(center.cx, center.cy);
    ctx.rotate(shape.rotation || 0);
    ctx.scale(shape.scale || 1, shape.scale || 1);
    ctx.translate(-center.cx, -center.cy);

    ctx.beginPath();
    ctx.lineWidth = shape.lineWidth;
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.fillColor || "transparent";

    if (shape.lineType === "dashed") ctx.setLineDash([10, 10]);
    else if (shape.lineType === "dotted") ctx.setLineDash([1, shape.lineWidth * 3]);
    else ctx.setLineDash([]);
    ctx.lineCap = "round";

    if (shape.type === "circle") {
        ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
        if (shape.isFilled) ctx.fill();
        ctx.stroke();
    } 
    else if (shape.type === "line") {
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX, shape.endY);
        ctx.stroke();
    } 
    else if (shape.type === "triangle") {
        ctx.moveTo(shape.x + shape.width / 2, shape.y); // Puncak
        ctx.lineTo(shape.x, shape.y + shape.height);    // Kiri bawah
        ctx.lineTo(shape.x + shape.width, shape.y + shape.height); // Kanan bawah
        ctx.closePath();
        if (shape.isFilled) ctx.fill();
        ctx.stroke();
    }
    else if (shape.type === "brush") {
        if (shape.points.length > 0) {
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            shape.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }
    }
    ctx.restore(); // Kembalikan state kanvas ke semula agar bentuk lain tidak ikut terputar
};

// Menggambar Kotak Pembatas dan Titik Kontrol (Handles)
const drawBoundingBox = (shape) => {
    const center = calculateCenter(shape);
    // Radius estimasi kotak pembatas (disederhanakan)
    let r = 50; 
    if (shape.type === "circle") r = shape.radius;
    else if (shape.type === "line") r = Math.hypot(shape.startX - shape.endX, shape.startY - shape.endY) / 2;
    else if (shape.type === "brush") r = 50; // default perkiraan untuk kuas

    ctx.save();
    ctx.translate(center.cx, center.cy);
    ctx.rotate(shape.rotation || 0);
    ctx.scale(shape.scale || 1, shape.scale || 1);

    // Gambar Kotak Putus-putus
    ctx.beginPath();
    ctx.strokeStyle = "#007BFF";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.rect(-r - 10, -r - 10, (r * 2) + 20, (r * 2) + 20);
    ctx.stroke();

    // Gambar Handle Rotasi (Atas)
    ctx.beginPath();
    ctx.fillStyle = "#007BFF";
    ctx.arc(0, -r - 30, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -r - 10);
    ctx.lineTo(0, -r - 30);
    ctx.stroke();

    // Gambar Handle Skala (Kanan Bawah)
    ctx.beginPath();
    ctx.fillStyle = "#FF0000";
    ctx.rect(r + 5, r + 5, 10, 10);
    ctx.fill();

    ctx.restore();
};

// Fungsi membalikkan koordinat mouse dari layar ke sistem koordinat objek (Inverse Transform)
const inverseTransformPoint = (mouseX, mouseY, shape) => {
    const center = calculateCenter(shape);
    const scale = shape.scale || 1;
    const angle = -(shape.rotation || 0);

    // Kurangi translasi
    let dx = mouseX - center.cx;
    let dy = mouseY - center.cy;
    // Rotasi balik
    let rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    let ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    // Skala balik
    return { x: (rx / scale) + center.cx, y: (ry / scale) + center.cy };
};

// Mendeteksi area klik (Body, Scale Handle, Rotate Handle)
const checkInteraction = (x, y, shape) => {
    const center = calculateCenter(shape);
    let r = 50;
    if (shape.type === "circle") r = shape.radius;
    else if (shape.type === "line") r = Math.hypot(shape.startX - shape.endX, shape.startY - shape.endY) / 2;

    const localP = inverseTransformPoint(x, y, shape);

    // Cek Handle Skala (Kanan Bawah)
    if (localP.x > center.cx + r && localP.x < center.cx + r + 20 && localP.y > center.cy + r && localP.y < center.cy + r + 20) return 'scale';
    
    // Cek Handle Rotasi (Atas)
    if (Math.hypot(localP.x - center.cx, localP.y - (center.cy - r - 30)) < 15) return 'rotate';

    // Cek Body (Di dalam kotak)
    if (localP.x > center.cx - r - 10 && localP.x < center.cx + r + 10 && localP.y > center.cy - r - 10 && localP.y < center.cy + r + 10) return 'move';

    return null;
};

// ================= EVENT LISTENER MOUSE =================

canvas.addEventListener("mousedown", (e) => {
    startX = e.offsetX;
    startY = e.offsetY;

    if (selectedTool === "tool-select") {
        if (selectedShape) {
            interactionMode = checkInteraction(startX, startY, selectedShape);
            if (interactionMode) {
                const center = calculateCenter(selectedShape);
                initialAngle = selectedShape.rotation || 0;
                initialScale = selectedShape.scale || 1;
                return; // Jika kena handle, hentikan pencarian bentuk lain
            }
        }

        // Cari bentuk yang diklik dari yang paling atas
        selectedShape = null;
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (checkInteraction(startX, startY, shapes[i])) {
                selectedShape = shapes[i];
                interactionMode = 'move';
                break;
            }
        }
        redrawCanvas();
    } 
    else if (selectedTool === "tool-fill") {
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (checkInteraction(startX, startY, shapes[i]) && shapes[i].type === "circle") {
                shapes[i].isFilled = true;
                shapes[i].fillColor = colorPicker.value;
                redrawCanvas();
                break;
            }
        }
    }
    else {
        isDrawing = true;
        currentShape = {
            type: selectedTool.replace("tool-", ""),
            color: colorPicker.value,
            lineWidth: sizeSlider.value,
            lineType: lineTypeSelect.value,
            isFilled: false,
            rotation: 0,
            scale: 1
        };

        if (currentShape.type === "brush") currentShape.points = [{x: startX, y: startY}];
        if (currentShape.type === "circle") { currentShape.x = startX; currentShape.y = startY; currentShape.radius = 0; }
        if (currentShape.type === "line") { currentShape.startX = startX; currentShape.startY = startY; currentShape.endX = startX; currentShape.endY = startY; }
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (selectedTool === "tool-select" && selectedShape && interactionMode) {
        const center = calculateCenter(selectedShape);
        
        if (interactionMode === 'move') {
            const dx = e.offsetX - startX;
            const dy = e.offsetY - startY;

            if (selectedShape.type === "circle") {
                selectedShape.x += dx; selectedShape.y += dy;
            } else if (selectedShape.type === "line") {
                selectedShape.startX += dx; selectedShape.startY += dy;
                selectedShape.endX += dx; selectedShape.endY += dy;
            } else if (selectedShape.type === "brush") {
                selectedShape.points.forEach(p => { p.x += dx; p.y += dy; });
            }
            startX = e.offsetX; startY = e.offsetY;
        } 
        else if (interactionMode === 'rotate') {
            // Hitung sudut rotasi baru menggunakan arc-tangent
            const currentMouseAngle = Math.atan2(e.offsetY - center.cy, e.offsetX - center.cx);
            const startMouseAngle = Math.atan2(startY - center.cy, startX - center.cx);
            selectedShape.rotation = initialAngle + (currentMouseAngle - startMouseAngle);
        }
        else if (interactionMode === 'scale') {
            // Hitung skala berdasarkan jarak tarikan mouse
            const startDist = Math.hypot(startX - center.cx, startY - center.cy);
            const currentDist = Math.hypot(e.offsetX - center.cx, e.offsetY - center.cy);
            selectedShape.scale = initialScale * (currentDist / startDist);
        }
        redrawCanvas();
    } 
    else if (isDrawing && currentShape) {
        if (currentShape.type === "brush") {
            currentShape.points.push({x: e.offsetX, y: e.offsetY});
        } else if (currentShape.type === "circle") {
            currentShape.radius = Math.sqrt(Math.pow(startX - e.offsetX, 2) + Math.pow(startY - e.offsetY, 2));
        } else if (currentShape.type === "line") {
            currentShape.endX = e.offsetX; currentShape.endY = e.offsetY;
        }
        redrawCanvas();
    }
});

canvas.addEventListener("mouseup", () => {
    if (isDrawing && currentShape) {
        shapes.push(currentShape);
        currentShape = null;
    }
    isDrawing = false;
    interactionMode = null;
    redrawCanvas();
});

toolBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelector(".options .active").classList.remove("active");
        btn.classList.add("active");
        selectedTool = btn.id;
        selectedShape = null; // Deselect saat mengganti alat
        redrawCanvas();
    });
});

clearCanvasBtn.addEventListener("click", () => {
    shapes = []; 
    selectedShape = null;
    redrawCanvas();
});