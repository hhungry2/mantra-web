// Boxes are {x, y, w, h} with x/y at the top-left corner, in screen pixels.

export function box(cx, cy, w, h) {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function contains(b, x, y) {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}
