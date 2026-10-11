import * as THREE from 'three';

// All surface textures are painted procedurally on canvases (no image files).

export function canvasTexture(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function grain(g, x, y, w, h, color, n = 40, alpha = 0.08) {
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const yy = y + Math.random() * h;
    g.lineWidth = Math.random() * 1.5 + 0.5;
    g.beginPath();
    g.moveTo(x, yy);
    g.bezierCurveTo(x + w * 0.3, yy + (Math.random() - 0.5) * 4, x + w * 0.6, yy + (Math.random() - 0.5) * 4, x + w, yy);
    g.stroke();
  }
  g.globalAlpha = 1;
}

export const floorTexture = () => canvasTexture(512, 512, (g, w, h) => {
  const rows = 8, rh = h / rows;
  const tones = ['#7a4f30', '#83563a', '#6f4529', '#8a5c3c', '#764b2e'];
  for (let r = 0; r < rows; r++) {
    let x = -((r * 97) % 200);
    while (x < w) {
      const len = 180 + Math.random() * 160;
      g.fillStyle = tones[Math.floor(Math.random() * tones.length)];
      g.fillRect(x, r * rh, len, rh);
      grain(g, x, r * rh, len, rh, '#2a170c', 10, 0.12);
      g.fillStyle = 'rgba(30,15,6,0.55)';
      g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(30,15,6,0.6)';
    g.fillRect(0, r * rh, w, 2);
  }
}, { repeat: [4, 4] });

export const wallTexture = () => canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#e9d9b8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(120,90,50,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  // green wainscot (Earth Kingdom)
  g.fillStyle = '#3f6a42';
  g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = '#335a37';
  for (let x = 12; x < w; x += 128) g.fillRect(x, h * 0.67, 104, h * 0.28);
  g.fillStyle = '#5b3a22';
  g.fillRect(0, h * 0.6, w, 16);
  g.fillRect(0, h - 10, w, 10);
  g.fillStyle = '#c9a04a';
  g.fillRect(0, h * 0.6 + 16, w, 3);
  // vertical beams
  g.fillStyle = '#5b3a22';
  g.fillRect(0, 0, 18, h * 0.6);
  g.fillStyle = '#4a2e1a';
  g.fillRect(0, 0, w, 14);
}, { repeat: [5, 1] });

export const rugTexture = () => canvasTexture(1024, 680, (g, w, h) => {
  g.fillStyle = '#7c2a20';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 10;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.lineWidth = 3;
  g.strokeRect(46, 46, w - 92, h - 92);
  g.fillStyle = '#5e1d16';
  g.fillRect(56, 56, w - 112, h - 112);
  // cloud scroll motif along the border
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 3;
  for (let x = 70; x < w - 60; x += 60) {
    for (const y of [36, h - 36]) {
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 1.5);
      g.stroke();
    }
  }
  g.globalAlpha = 0.25;
  g.strokeStyle = '#e8c47a';
  g.beginPath();
  g.arc(w / 2, h / 2, h * 0.32, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
});

export const paiShoTexture = () => canvasTexture(512, 320, (g, w, h) => {
  g.fillStyle = '#c99a5e';
  g.fillRect(0, 0, w, h);
  grain(g, 0, 0, w, h, '#6b4422', 60, 0.12);
  const cx = w / 2, cy = h / 2, R = h * 0.44;
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#efe0bf';
  g.fillRect(0, 0, w, h);
  // red/white garden quadrants
  g.fillStyle = '#b8392a';
  g.beginPath();
  g.moveTo(cx, cy - R); g.lineTo(cx + R * 0.5, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R * 0.5, cy); g.closePath();
  g.fill();
  g.fillStyle = '#f7f2e6';
  g.beginPath();
  g.moveTo(cx - R, cy); g.lineTo(cx, cy - R * 0.5); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R * 0.5); g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(60,30,10,0.45)';
  g.lineWidth = 1;
  for (let i = -9; i <= 9; i++) {
    g.beginPath(); g.moveTo(cx + i * R / 9, cy - R); g.lineTo(cx + i * R / 9, cy + R); g.stroke();
    g.beginPath(); g.moveTo(cx - R, cy + i * R / 9); g.lineTo(cx + R, cy + i * R / 9); g.stroke();
  }
  g.restore();
  g.strokeStyle = '#5b3a22';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
});

export const bannerTexture = (glyph = '茶', sub = '') => canvasTexture(256, 384, (g, w, h) => {
  g.fillStyle = '#2f5a38';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 10;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 2;
  g.strokeRect(26, 26, w - 52, h - 52);
  g.fillStyle = '#e8c870';
  g.font = 'bold 150px "KaiTi", "STKaiti", "Noto Serif SC", "SimSun", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, w / 2, h * 0.45);
  if (sub) {
    g.font = 'bold 22px Georgia, serif';
    g.fillText(sub, w / 2, h * 0.82);
  }
});

export const signTexture = (text) => canvasTexture(512, 128, (g, w, h) => {
  g.fillStyle = '#5b3a22';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#f2d27a';
  g.font = 'bold 50px "Palatino Linotype", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3);
});

export const windowTexture = () => canvasTexture(256, 256, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#ffd99a');
  grd.addColorStop(0.55, '#f6a25e');
  grd.addColorStop(1, '#8f5a8a');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // distant Ba Sing Se rooftops
  g.fillStyle = 'rgba(70,45,60,0.75)';
  for (let x = -10; x < w; x += 46) {
    const y = h * 0.66 + Math.random() * 20;
    g.beginPath();
    g.moveTo(x, h); g.lineTo(x, y); g.lineTo(x + 20, y - 18); g.lineTo(x + 40, y); g.lineTo(x + 40, h);
    g.fill();
  }
});
