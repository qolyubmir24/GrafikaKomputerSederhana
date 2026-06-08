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

let interactionMode = null;
let startX, startY;
let initialAngle = 0;
let initialScale = 1;
let initialSkewX = 0;
let initialSkewY = 0;

let undoStack = [];
let redoStack = [];

// ─── Utility: manual hypot (mengganti Math.hypot) ───────────────────────────
function hypot(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Utility: clamp ──────────────────────────────────────────────────────────
function clamp(val, lo, hi) {
  return val < lo ? lo : val > hi ? hi : val;
}

// ─── Bresenham's Line Algorithm (mengganti moveTo+lineTo+stroke) ─────────────
// Menggambar garis pixel-per-pixel dari (x0,y0) ke (x1,y1)
function bresenhamLine(x0, y0, x1, y1, lineWidth, color, dashPattern) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  // Hitung total panjang garis untuk pola dash/dot
  const totalLen = hypot(x1 - x0, y1 - y0) || 1;
  let pixelIndex = 0;

  // Ukuran titik berdasarkan lineWidth
  const half = Math.max(1, Math.floor(lineWidth / 2));

  ctx.fillStyle = color;

  let cx = x0;
  let cy = y0;

  while (true) {
    // Tentukan apakah piksel ini harus digambar (dash/dot pattern)
    let draw = true;
    if (dashPattern && dashPattern.length > 0) {
      const cycleLen = dashPattern.reduce((a, b) => a + b, 0);
      const pos = pixelIndex % cycleLen;
      let acc = 0;
      let inDash = false;
      for (let i = 0; i < dashPattern.length; i++) {
        acc += dashPattern[i];
        if (pos < acc) {
          inDash = i % 2 === 0; // genap = draw, ganjil = gap
          break;
        }
      }
      draw = inDash;
    }

    if (draw) {
      // Gambar titik persegi kecil sebagai "ketebalan" garis
      ctx.fillRect(cx - half, cy - half, lineWidth, lineWidth);
    }

    if (cx === x1 && cy === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
    pixelIndex++;
  }
}

// ─── Midpoint Circle Algorithm (mengganti ctx.arc) ───────────────────────────
// Menggambar lingkaran dengan algoritma midpoint (Bresenham circle)
function midpointCircle(
  cx,
  cy,
  radius,
  lineWidth,
  color,
  fill,
  fillColor,
  dashPattern,
) {
  radius = Math.round(radius);
  cx = Math.round(cx);
  cy = Math.round(cy);

  if (radius <= 0) return;

  if (fill) {
    // Isi lingkaran: scan-line dari -radius ke +radius
    ctx.fillStyle = fillColor;
    for (let y = -radius; y <= radius; y++) {
      const xSpan = Math.round(Math.sqrt(radius * radius - y * y));
      ctx.fillRect(cx - xSpan, cy + y, 2 * xSpan, 1);
    }
  }

  // Gambar outline dengan midpoint circle algorithm
  // Kumpulkan semua titik pada lingkaran, lalu hubungkan dengan bresenham
  const points = [];
  let x = 0;
  let y = radius;
  let d = 1 - radius;

  function addOctants(px, py) {
    points.push(
      [cx + px, cy + py],
      [cx - px, cy + py],
      [cx + px, cy - py],
      [cx - px, cy - py],
      [cx + py, cy + px],
      [cx - py, cy + px],
      [cx + py, cy - px],
      [cx - py, cy - px],
    );
  }

  while (x <= y) {
    addOctants(x, y);
    if (d < 0) {
      d += 2 * x + 3;
    } else {
      d += 2 * (x - y) + 5;
      y--;
    }
    x++;
  }

  // Urutkan titik berdasarkan sudut agar urut
  points.sort((a, b) => {
    const angA = Math.atan2(a[1] - cy, a[0] - cx);
    const angB = Math.atan2(b[1] - cy, b[0] - cx);
    return angA - angB;
  });

  // Hubungkan titik-titik dengan bresenham
  ctx.fillStyle = color;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    bresenhamLine(
      points[i][0],
      points[i][1],
      next[0],
      next[1],
      lineWidth,
      color,
      dashPattern,
    );
  }
}

// ─── Parametrik Ellipse (mengganti ctx.ellipse) ───────────────────────────────
// Menggambar ellipse dengan persamaan parametrik manual
function parametricEllipse(
  cx,
  cy,
  rx,
  ry,
  lineWidth,
  color,
  fill,
  fillColor,
  dashPattern,
) {
  rx = Math.round(rx);
  ry = Math.round(ry);
  if (rx <= 0 || ry <= 0) return;

  if (fill) {
    ctx.fillStyle = fillColor;
    // Scan-line fill untuk ellipse
    for (let y = -ry; y <= ry; y++) {
      // x = rx * sqrt(1 - (y/ry)^2)
      const xSpan = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      ctx.fillRect(cx - xSpan, cy + y, 2 * xSpan, 1);
    }
  }

  // Gambar outline dengan pendekatan parametrik
  // Hitung jumlah langkah berdasarkan keliling perkiraan
  const steps = Math.max(
    36,
    Math.round(
      Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))),
    ),
  );
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    pts.push([
      Math.round(cx + rx * Math.cos(t)),
      Math.round(cy + ry * Math.sin(t)),
    ]);
  }

  ctx.fillStyle = color;
  for (let i = 0; i < pts.length - 1; i++) {
    bresenhamLine(
      pts[i][0],
      pts[i][1],
      pts[i + 1][0],
      pts[i + 1][1],
      lineWidth,
      color,
      dashPattern,
    );
  }
}

// ─── Manual Rectangle (mengganti ctx.rect) ───────────────────────────────────
// Menggambar persegi panjang dari 4 garis Bresenham
function manualRect(
  x1,
  y1,
  x2,
  y2,
  lineWidth,
  color,
  fill,
  fillColor,
  dashPattern,
) {
  const lx = Math.min(x1, x2);
  const ly = Math.min(y1, y2);
  const rx = Math.max(x1, x2);
  const ry = Math.max(y1, y2);

  if (fill) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(lx, ly, rx - lx, ry - ly);
  }

  ctx.fillStyle = color;
  // Atas, bawah, kiri, kanan
  bresenhamLine(lx, ly, rx, ly, lineWidth, color, dashPattern);
  bresenhamLine(rx, ly, rx, ry, lineWidth, color, dashPattern);
  bresenhamLine(rx, ry, lx, ry, lineWidth, color, dashPattern);
  bresenhamLine(lx, ry, lx, ly, lineWidth, color, dashPattern);
}

// ─── Manual Triangle (mengganti moveTo+lineTo+closePath) ─────────────────────
function manualTriangle(
  points,
  lineWidth,
  color,
  fill,
  fillColor,
  dashPattern,
) {
  if (fill) {
    // Scanline fill untuk segitiga
    ctx.fillStyle = fillColor;
    const pts = points.slice().sort((a, b) => a.y - b.y);
    const [p0, p1, p2] = pts;

    function interpX(ya, yb, xa, xb, y) {
      if (yb === ya) return xa;
      return xa + ((y - ya) / (yb - ya)) * (xb - xa);
    }

    for (let y = Math.round(p0.y); y <= Math.round(p2.y); y++) {
      const xLeft = interpX(p0.y, p2.y, p0.x, p2.x, y);
      let xRight;
      if (y < p1.y) {
        xRight = interpX(p0.y, p1.y, p0.x, p1.x, y);
      } else {
        xRight = interpX(p1.y, p2.y, p1.x, p2.x, y);
      }
      const xL = Math.round(Math.min(xLeft, xRight));
      const xR = Math.round(Math.max(xLeft, xRight));
      ctx.fillRect(xL, y, xR - xL, 1);
    }
  }

  ctx.fillStyle = color;
  bresenhamLine(
    points[0].x,
    points[0].y,
    points[1].x,
    points[1].y,
    lineWidth,
    color,
    dashPattern,
  );
  bresenhamLine(
    points[1].x,
    points[1].y,
    points[2].x,
    points[2].y,
    lineWidth,
    color,
    dashPattern,
  );
  bresenhamLine(
    points[2].x,
    points[2].y,
    points[0].x,
    points[0].y,
    lineWidth,
    color,
    dashPattern,
  );
}

// ─── Manual Polyline untuk Brush ─────────────────────────────────────────────
function manualPolyline(points, lineWidth, color, dashPattern) {
  if (points.length < 2) return;
  ctx.fillStyle = color;
  for (let i = 0; i < points.length - 1; i++) {
    bresenhamLine(
      Math.round(points[i].x),
      Math.round(points[i].y),
      Math.round(points[i + 1].x),
      Math.round(points[i + 1].y),
      lineWidth,
      color,
      dashPattern,
    );
  }
}

// ─── Resolve dash pattern dari lineType ──────────────────────────────────────
function getDashPattern(lineType, lineWidth) {
  if (lineType === "dashed") return [10, 10];
  if (lineType === "dotted") return [1, lineWidth * 3];
  return null; // solid
}

// ─────────────────────────────────────────────────────────────────────────────

function saveState() {
  undoStack.push(JSON.stringify(shapes));
  redoStack = [];
}

function undo() {
  if (undoStack.length > 0) {
    redoStack.push(JSON.stringify(shapes));
    shapes = JSON.parse(undoStack.pop());
    selectedShape = null;
    redrawCanvas();
  }
}

function redo() {
  if (redoStack.length > 0) {
    undoStack.push(JSON.stringify(shapes));
    shapes = JSON.parse(redoStack.pop());
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

  // Inverse skew (manual matrix inverse)
  let det = 1 - skewX * skewY;
  let ix = (dx - skewX * dy) / det;
  let iy = (dy - skewY * dx) / det;

  // Inverse rotation (manual cos/sin)
  let rx = ix * Math.cos(angle) - iy * Math.sin(angle);
  let ry = ix * Math.sin(angle) + iy * Math.cos(angle);

  return { x: rx / scale + center.cx, y: ry / scale + center.cy };
};

const checkInteraction = (x, y, shape) => {
  const bbox = getBoundingBox(shape);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const padding = 10;

  const localP = inverseTransformPoint(x, y, shape);

  if (
    localP.x > bbox.maxX + padding / 2 &&
    localP.x < bbox.maxX + padding + 10 &&
    localP.y > bbox.maxY + padding / 2 &&
    localP.y < bbox.maxY + padding + 10
  ) {
    return "scale";
  }
  if (
    // Manual distance check (mengganti Math.hypot)
    hypot(
      localP.x - (bbox.minX + w / 2),
      localP.y - (bbox.minY - padding - 10),
    ) < 15
  ) {
    return "rotate";
  }
  if (
    hypot(
      localP.x - (bbox.minX - padding - 10),
      localP.y - (bbox.minY + h / 2),
    ) < 12
  ) {
    return "shearX";
  }
  if (
    hypot(
      localP.x - (bbox.minX + w / 2),
      localP.y - (bbox.maxY + padding + 10),
    ) < 12
  ) {
    return "shearY";
  }
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

  // Terapkan transformasi: translate → rotate → scale → mirror → skew
  ctx.translate(center.cx, center.cy);
  if (shape.rotation) ctx.rotate(shape.rotation);
  if (shape.scale) ctx.scale(shape.scale, shape.scale);
  ctx.scale(shape.mirrorX || 1, shape.mirrorY || 1);
  if (shape.skewX || shape.skewY) {
    ctx.transform(1, shape.skewY || 0, shape.skewX || 0, 1, 0, 0);
  }
  ctx.translate(-center.cx, -center.cy);

  const lw = shape.lineWidth || 2;
  const color = shape.color || "#000";
  const fillColor = shape.fillColor || "transparent";
  const fill = !!shape.isFilled;
  const dash = getDashPattern(shape.lineType, lw);

  // ── Gambar bentuk dengan algoritma manual ──
  if (shape.type === "circle") {
    midpointCircle(
      shape.x,
      shape.y,
      shape.radius,
      lw,
      color,
      fill,
      fillColor,
      dash,
    );
  } else if (shape.type === "line") {
    bresenhamLine(
      shape.startX,
      shape.startY,
      shape.endX,
      shape.endY,
      lw,
      color,
      dash,
    );
  } else if (shape.type === "brush") {
    manualPolyline(shape.points, lw, color, dash);
  } else if (shape.type === "oval") {
    parametricEllipse(
      shape.cx,
      shape.cy,
      shape.rx,
      shape.ry,
      lw,
      color,
      fill,
      fillColor,
      dash,
    );
  } else if (shape.type === "rectangle") {
    manualRect(
      shape.x1,
      shape.y1,
      shape.x2,
      shape.y2,
      lw,
      color,
      fill,
      fillColor,
      dash,
    );
  } else if (shape.type === "triangle") {
    manualTriangle(shape.points, lw, color, fill, fillColor, dash);
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
  ctx.scale(shape.mirrorX || 1, shape.mirrorY || 1);
  if (shape.skewX || shape.skewY) {
    ctx.transform(1, shape.skewY || 0, shape.skewX || 0, 1, 0, 0);
  }
  ctx.translate(-center.cx, -center.cy);

  // Bounding box dashed border — tetap pakai ctx karena ini UI overlay bukan shape
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

  // Rotate handle
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

  // Scale handle (merah)
  ctx.beginPath();
  ctx.fillStyle = "#FF0000";
  ctx.fillRect(bbox.maxX + padding, bbox.maxY + padding, 10, 10);

  // ShearX handle (ungu)
  ctx.beginPath();
  ctx.fillStyle = "#8B5CF6";
  ctx.fillRect(
    bbox.minX - padding - 10,
    bbox.minY + (bbox.maxY - bbox.minY) / 2 - 5,
    10,
    10,
  );

  // ShearY handle (kuning)
  ctx.beginPath();
  ctx.fillStyle = "#F59E0B";
  ctx.fillRect(
    bbox.minX + (bbox.maxX - bbox.minX) / 2 - 5,
    bbox.maxY + padding + 10,
    10,
    10,
  );

  ctx.restore();
};

// ─── Event Listeners (tidak berubah) ─────────────────────────────────────────

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
      mirrorX: 1,
      mirrorY: 1,
    };

    if (currentShape.type === "brush") {
      currentShape.points = [{ x: startX, y: startY }];
    } else if (currentShape.type === "triangle") {
      currentShape.points = [
        { x: startX, y: startY },
        { x: startX, y: startY },
        { x: startX, y: startY },
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
      // Manual distance (mengganti Math.hypot)
      const startDist = hypot(startX - center.cx, startY - center.cy);
      const currentDist = hypot(e.offsetX - center.cx, e.offsetY - center.cy);
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
      let x1 = startX,
        y1 = startY;
      let x2 = e.offsetX,
        y2 = e.offsetY;
      currentShape.points = [
        { x: (x1 + x2) / 2, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 },
      ];
    } else if (currentShape.type === "circle") {
      // Manual hypot (mengganti Math.hypot)
      currentShape.radius = hypot(startX - e.offsetX, startY - e.offsetY);
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

window.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && selectedShape) {
    saveState();
    shapes = shapes.filter((shape) => shape !== selectedShape);
    selectedShape = null;
    redrawCanvas();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
  }
  if (e.key.toLowerCase() === "h" && selectedShape) {
    saveState();
    selectedShape.mirrorX = (selectedShape.mirrorX || 1) * -1;
    redrawCanvas();
  }
  if (e.key.toLowerCase() === "v" && selectedShape) {
    saveState();
    selectedShape.mirrorY = (selectedShape.mirrorY || 1) * -1;
    redrawCanvas();
  }
});

toolBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".options .active").classList.remove("active");
    btn.classList.add("active");
    selectedTool = btn.id;
    selectedShape = null;
    redrawCanvas();
  });
});

clearCanvasBtn.addEventListener("click", () => {
  if (shapes.length > 0) {
    saveState();
    shapes = [];
    selectedShape = null;
    redrawCanvas();
  }
});
