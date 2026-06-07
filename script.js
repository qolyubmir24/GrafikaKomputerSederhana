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
let interactionMode = null; // 'move', 'scale', 'rotate', 'shearX', 'shearY', null
let startX, startY;
let initialAngle = 0;
let initialScale = 1;
let initialSkewX = 0;
let initialSkewY = 0;
let undoStack = [];
let redoStack = [];

// Fungsi untuk menyimpan kondisi canvas saat ini ke dalam history stack
function saveState() {
  undoStack.push(JSON.stringify(shapes));
  redoStack = [];
}

function undo() {
  if (undoStack.length > 0) {
    // Simpan kondisi saat ini ke Redo sebelum kembali ke masa lalu
    redoStack.push(JSON.stringify(shapes));
    
    // Ambil state terakhir dari Undo stack
    let previousState = undoStack.pop();
    shapes = JSON.parse(previousState);
    
    selectedShape = null; // Reset selection agar tidak error
    redrawCanvas();
  }
}

function redo() {
  if (redoStack.length > 0) {
    // Simpan kondisi saat ini ke Undo sebelum maju ke depan
    undoStack.push(JSON.stringify(shapes));
    
    // Ambil state dari Redo stack
    let nextState = redoStack.pop();
    shapes = JSON.parse(nextState);
    
    selectedShape = null;
    redrawCanvas();
  }
}

window.addEventListener("load", () => {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  redrawCanvas();
});

function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  redrawCanvas();
}

function getBoundingBox(shape) {
  if (shape.type === "circle") {
    return {
      minX: shape.x - shape.radius,
      minY: shape.y - shape.radius,
      maxX: shape.x + shape.radius,
      maxY: shape.y + shape.radius,
    };
  } else if (shape.type === "line") {
    return {
      minX: Math.min(shape.startX, shape.endX),
      minY: Math.min(shape.startY, shape.endY),
      maxX: Math.max(shape.startX, shape.endX),
      maxY: Math.max(shape.startY, shape.endY),
    };
  } else if (shape.type === "brush") {
    let xs = shape.points.map((p) => p.x);
    let ys = shape.points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  } else if (shape.type === "oval") {
    return {
      minX: shape.cx - shape.rx,
      minY: shape.cy - shape.ry,
      maxX: shape.cx + shape.rx,
      maxY: shape.cy + shape.ry,
    };
  } else if (shape.type === "rectangle") {
    return {
      minX: Math.min(shape.x1, shape.x2),
      minY: Math.min(shape.y1, shape.y2),
      maxX: Math.max(shape.x1, shape.x2),
      maxY: Math.max(shape.y1, shape.y2),
    };
  } else if (shape.type === "triangle") {
    let xs = shape.points.map((p) => p.x);
    let ys = shape.points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

const calculateCenter = (shape) => {
  if (shape.type === "circle") {
    return { cx: shape.x, cy: shape.y };
  } else if (shape.type === "line") {
    return {
      cx: (shape.startX + shape.endX) / 2,
      cy: (shape.startY + shape.endY) / 2,
    };
  } else if (shape.type === "brush") {
    let minX = Math.min(...shape.points.map((p) => p.x));
    let maxX = Math.max(...shape.points.map((p) => p.x));
    let minY = Math.min(...shape.points.map((p) => p.y));
    let maxY = Math.max(...shape.points.map((p) => p.y));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  } else if (shape.type === "oval") {
    return { cx: shape.cx, cy: shape.cy };
  } else if (shape.type === "rectangle") {
    return { cx: (shape.x1 + shape.x2) / 2, cy: (shape.y1 + shape.y2) / 2 };
  } else if (shape.type === "triangle") {
    let xs = shape.points.map((p) => p.x);
    let ys = shape.points.map((p) => p.y);
    return { cx: (xs[0] + xs[1] + xs[2]) / 3, cy: (ys[0] + ys[1] + ys[2]) / 3 };
  }
  return { cx: 0, cy: 0 };
};

const inverseTransformPoint = (mouseX, mouseY, shape) => {
  const center = calculateCenter(shape);
  const scale = shape.scale || 1;
  const angle = -(shape.rotation || 0);
  const skewX = shape.skewX || 0;
  const skewY = shape.skewY || 0;

  let dx = mouseX - center.cx;
  let dy = mouseY - center.cy;

  let det = 1 - skewX * skewY;
  let ix = (dx - skewX * dy) / det;
  let iy = (dy - skewY * dx) / det;

  let rx = ix * Math.cos(angle) - iy * Math.sin(angle);
  let ry = ix * Math.sin(angle) + iy * Math.cos(angle);

  return { x: rx / scale + center.cx, y: ry / scale + center.cy };
};

const checkInteraction = (x, y, shape) => {
  const center = calculateCenter(shape);
  const bbox = getBoundingBox(shape);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const padding = 10;

  const localP = inverseTransformPoint(x, y, shape);

  // Handle Skala (kanan bawah)
  if (
    localP.x > bbox.maxX + padding / 2 &&
    localP.x < bbox.maxX + padding + 10 &&
    localP.y > bbox.maxY + padding / 2 &&
    localP.y < bbox.maxY + padding + 10
  ) {
    return "scale";
  }
  // Handle Rotasi (atas tengah)
  if (
    Math.hypot(
      localP.x - (bbox.minX + w / 2),
      localP.y - (bbox.minY - padding - 10),
    ) < 15
  ) {
    return "rotate";
  }
  // Handle Shear X (kiri tengah)
  if (
    Math.hypot(
      localP.x - (bbox.minX - padding - 10),
      localP.y - (bbox.minY + h / 2),
    ) < 12
  ) {
    return "shearX";
  }
  // Handle Shear Y (bawah tengah)
  if (
    Math.hypot(
      localP.x - (bbox.minX + w / 2),
      localP.y - (bbox.maxY + padding + 10),
    ) < 12
  ) {
    return "shearY";
  }
  // Body (di dalam bounding box + padding)
  if (
    localP.x > bbox.minX - padding &&
    localP.x < bbox.maxX + padding &&
    localP.y > bbox.minY - padding &&
    localP.y < bbox.maxY + padding
  ) {
    return "move";
  }
  return null;
};

//drawing function
const redrawCanvas = () => {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  shapes.forEach((shape) => drawShape(shape));
  if (currentShape) drawShape(currentShape);
  if (selectedShape && selectedTool === "tool-select") {
    drawBoundingBox(selectedShape);
  }
};

const drawShape = (shape) => {
  ctx.save();
  const center = calculateCenter(shape);
  ctx.translate(center.cx, center.cy);
  if (shape.rotation) ctx.rotate(shape.rotation);
  if (shape.scale) ctx.scale(shape.scale, shape.scale);
  if (shape.skewX || shape.skewY) {
    ctx.transform(1, shape.skewY || 0, shape.skewX || 0, 1, 0, 0);
  }
  ctx.translate(-center.cx, -center.cy);

  ctx.beginPath();
  ctx.lineWidth = shape.lineWidth || 2;
  ctx.strokeStyle = shape.color || "#000";
  ctx.fillStyle = shape.fillColor || "transparent";

  if (shape.lineType === "dashed") ctx.setLineDash([10, 10]);
  else if (shape.lineType === "dotted")
    ctx.setLineDash([1, (shape.lineWidth || 2) * 3]);
  else ctx.setLineDash([]);
  ctx.lineCap = "round";

  if (shape.type === "circle") {
    ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
    if (shape.isFilled) ctx.fill();
    ctx.stroke();
  } else if (shape.type === "line") {
    ctx.moveTo(shape.startX, shape.startY);
    ctx.lineTo(shape.endX, shape.endY);
    ctx.stroke();
  } else if (shape.type === "brush") {
    if (shape.points.length > 0) {
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      shape.points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  } else if (shape.type === "oval") {
    ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
    if (shape.isFilled) ctx.fill();
    ctx.stroke();
  } else if (shape.type === "rectangle") {
    ctx.rect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
    if (shape.isFilled) ctx.fill();
    ctx.stroke();
  } else if (shape.type === "triangle") {
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    ctx.lineTo(shape.points[1].x, shape.points[1].y);
    ctx.lineTo(shape.points[2].x, shape.points[2].y);
    ctx.closePath();
    if (shape.isFilled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

const drawBoundingBox = (shape) => {
  const bbox = getBoundingBox(shape);
  const center = calculateCenter(shape);
  const padding = 10;
  ctx.save();
  ctx.translate(center.cx, center.cy);
  if (shape.rotation) ctx.rotate(shape.rotation);
  if (shape.scale) ctx.scale(shape.scale, shape.scale);
  if (shape.skewX || shape.skewY) {
    ctx.transform(1, shape.skewY || 0, shape.skewX || 0, 1, 0, 0);
  }
  ctx.translate(-center.cx, -center.cy);

  ctx.beginPath();
  ctx.strokeStyle = "#007BFF";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.rect(
    bbox.minX - padding,
    bbox.minY - padding,
    bbox.maxX - bbox.minX + 2 * padding,
    bbox.maxY - bbox.minY + 2 * padding,
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = "#007BFF";
  ctx.arc(
    bbox.minX + (bbox.maxX - bbox.minX) / 2,
    bbox.minY - padding - 10,
    6,
    0,
    2 * Math.PI,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bbox.minX + (bbox.maxX - bbox.minX) / 2, bbox.minY - padding);
  ctx.lineTo(bbox.minX + (bbox.maxX - bbox.minX) / 2, bbox.minY - padding - 10);
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = "#FF0000";
  ctx.fillRect(bbox.maxX + padding, bbox.maxY + padding, 10, 10);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#8B5CF6";
  ctx.fillRect(
    bbox.minX - padding - 10,
    bbox.minY + (bbox.maxY - bbox.minY) / 2 - 5,
    10,
    10,
  );
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#F59E0B";
  ctx.fillRect(
    bbox.minX + (bbox.maxX - bbox.minX) / 2 - 5,
    bbox.maxY + padding + 10,
    10,
    10,
  );
  ctx.fill();

  ctx.restore();
};

canvas.addEventListener("mousedown", (e) => {
  startX = e.offsetX;
  startY = e.offsetY;

  if (selectedTool === "tool-select") {
    if (selectedShape) {
      interactionMode = checkInteraction(startX, startY, selectedShape);
      if (interactionMode) {
        saveState();
        
        initialAngle = selectedShape.rotation || 0;
        initialScale = selectedShape.scale || 1;
        initialSkewX = selectedShape.skewX || 0;
        initialSkewY = selectedShape.skewY || 0;
        return;
      }
    }
    
    let found = false;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (checkInteraction(startX, startY, shapes[i])) {
        selectedShape = shapes[i];
        interactionMode = "move";
        saveState();
        found = true;
        break;
      }
    }
    if (!found) selectedShape = null; 
    redrawCanvas();
  } else if (selectedTool === "tool-fill") {
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (checkInteraction(startX, startY, shapes[i])) {
        saveState();
        shapes[i].isFilled = true;
        shapes[i].fillColor = colorPicker.value;
        redrawCanvas();
        break;
      }
    }
  } else {
    isDrawing = true;
    currentShape = {
      type: selectedTool.replace("tool-", ""),
      color: colorPicker.value,
      lineWidth: parseInt(sizeSlider.value),
      lineType: lineTypeSelect.value,
      isFilled: false,
      rotation: 0,
      scale: 1,
      skewX: 0,
      skewY: 0,
    };

    if (currentShape.type === "brush") {
      currentShape.points = [{ x: startX, y: startY }];
    } else if (currentShape.type === "triangle") {
      currentShape.points = [
        { x: startX, y: startY },
        { x: startX, y: startY },
        { x: startX, y: startY }
      ];
    } else if (currentShape.type === "circle") {
      currentShape.x = startX;
      currentShape.y = startY;
      currentShape.radius = 0;
    } else if (currentShape.type === "line") {
      currentShape.startX = startX;
      currentShape.startY = startY;
      currentShape.endX = startX;
      currentShape.endY = startY;
    } else if (currentShape.type === "oval") {
      currentShape.cx = startX;
      currentShape.cy = startY;
      currentShape.rx = 0;
      currentShape.ry = 0;
    } else if (currentShape.type === "rectangle") {
      currentShape.x1 = startX;
      currentShape.y1 = startY;
      currentShape.x2 = startX;
      currentShape.y2 = startY;
    }
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (selectedTool === "tool-select") {
    if (selectedShape) {
      let mode = checkInteraction(e.offsetX, e.offsetY, selectedShape);
      if (mode === "move") canvas.style.cursor = "move";
      else if (mode === "rotate") canvas.style.cursor = "grab";
      else if (mode === "scale") canvas.style.cursor = "nwse-resize";
      else if (mode === "shearX") canvas.style.cursor = "ew-resize";
      else if (mode === "shearY") canvas.style.cursor = "ns-resize";
      else canvas.style.cursor = "default";
    } else {
      canvas.style.cursor = "default";
    }
  } else {
    canvas.style.cursor = "crosshair";
  }

  if (selectedTool === "tool-select" && selectedShape && interactionMode) {
    const center = calculateCenter(selectedShape);

    if (interactionMode === "move") {
      const dx = e.offsetX - startX;
      const dy = e.offsetY - startY;
      if (selectedShape.type === "circle") {
        selectedShape.x += dx;
        selectedShape.y += dy;
      } else if (selectedShape.type === "line") {
        selectedShape.startX += dx;
        selectedShape.startY += dy;
        selectedShape.endX += dx;
        selectedShape.endY += dy;
      } else if (selectedShape.type === "brush") {
        selectedShape.points.forEach((p) => {
          p.x += dx;
          p.y += dy;
        });
      } else if (selectedShape.type === "oval") {
        selectedShape.cx += dx;
        selectedShape.cy += dy;
      } else if (selectedShape.type === "rectangle") {
        selectedShape.x1 += dx;
        selectedShape.y1 += dy;
        selectedShape.x2 += dx;
        selectedShape.y2 += dy;
      } else if (selectedShape.type === "triangle") {
        selectedShape.points.forEach((p) => {
          p.x += dx;
          p.y += dy;
        });
      }
      startX = e.offsetX;
      startY = e.offsetY;
    } else if (interactionMode === "rotate") {
      const currentMouseAngle = Math.atan2(
        e.offsetY - center.cy,
        e.offsetX - center.cx,
      );
      const startMouseAngle = Math.atan2(
        startY - center.cy,
        startX - center.cx,
      );
      selectedShape.rotation =
        initialAngle + (currentMouseAngle - startMouseAngle);
    } else if (interactionMode === "scale") {
      const startDist = Math.hypot(startX - center.cx, startY - center.cy);
      const currentDist = Math.hypot(
        e.offsetX - center.cx,
        e.offsetY - center.cy,
      );
      selectedShape.scale = initialScale * (currentDist / startDist);
    } else if (interactionMode === "shearX") {
      const deltaX = e.offsetX - startX;
      selectedShape.skewX = initialSkewX + deltaX * 0.01;
    } else if (interactionMode === "shearY") {
      const deltaY = e.offsetY - startY;
      selectedShape.skewY = initialSkewY + deltaY * 0.01;
    }
    redrawCanvas();
  } else if (isDrawing && currentShape) {
    if (currentShape.type === "brush") {
      currentShape.points.push({ x: e.offsetX, y: e.offsetY });
    } else if (currentShape.type === "triangle") {
      let x1 = startX;
      let y1 = startY;
      let x2 = e.offsetX;
      let y2 = e.offsetY;

      currentShape.points = [
        { x: (x1 + x2) / 2, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 }
      ];
    } else if (currentShape.type === "circle") {
      currentShape.radius = Math.hypot(startX - e.offsetX, startY - e.offsetY);
    } else if (currentShape.type === "line") {
      currentShape.endX = e.offsetX;
      currentShape.endY = e.offsetY;
    } else if (currentShape.type === "oval") {
      currentShape.rx = Math.abs(e.offsetX - startX);
      currentShape.ry = Math.abs(e.offsetY - startY);
    } else if (currentShape.type === "rectangle") {
      currentShape.x2 = e.offsetX;
      currentShape.y2 = e.offsetY;
    }
    redrawCanvas();
  }
});

canvas.addEventListener("mouseup", () => {
  if (isDrawing && currentShape) {
    saveState();
    shapes.push(currentShape);
    currentShape = null;
  }
  isDrawing = false;
  interactionMode = null;
  redrawCanvas();
});

// FITUR SHORTCUTS KEYBOARD (Delete, Undo, Redo)
window.addEventListener("keydown", (e) => {
  //Shortcut Delete / Backspace
  if ((e.key === "Delete" || e.key === "Backspace") && selectedShape) {
    saveState(); // Catat sebelum dihapus
    shapes = shapes.filter((shape) => shape !== selectedShape);
    selectedShape = null;
    redrawCanvas();
  }

  //Shortcut Undo (Ctrl + Z)
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }

  //Shortcut Redo (Ctrl + Y)
  if (e.ctrlKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
  }
});

// Ganti tool menu
toolBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".options .active").classList.remove("active");
    btn.classList.add("active");
    selectedTool = btn.id;
    selectedShape = null;
    redrawCanvas();
  });
});

// Bersihkan Canvas
clearCanvasBtn.addEventListener("click", () => {
  if (shapes.length > 0) {
    saveState(); // Catat sebelum dibersihkan total
    shapes = [];
    selectedShape = null;
    redrawCanvas();
  }
});