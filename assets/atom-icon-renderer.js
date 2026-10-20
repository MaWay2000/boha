// Separate small-size artwork: crisp strokes, minimal bloom, full icon footprint.
window.BohaAtomIconRenderer = function (canvas) {
  'use strict';
  const ctx = canvas.getContext('2d', {alpha: true});
  const tau = Math.PI * 2;
  function point(angle, ring) {
    const rotation = ring * Math.PI / 3 + Math.PI / 6;
    const x = Math.cos(angle) * 27, y = Math.sin(angle) * 5;
    return {x: 32 + x * Math.cos(rotation) - y * Math.sin(rotation),
      y: 32 + x * Math.sin(rotation) + y * Math.cos(rotation), z: Math.sin(angle)};
  }
  function rings(front) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = front ? 3.6 : 2.8;
    ctx.strokeStyle = front ? '#96ff36' : '#4edb27';
    ctx.shadowColor = '#72ff24'; ctx.shadowBlur = front ? 1.5 : 0;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      const start = front ? 0 : Math.PI;
      for (let i = 0; i <= 64; i++) {
        const p = point(start + i * Math.PI / 64, ring);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  function electron(p) {
    ctx.shadowColor = '#00ffbc'; ctx.shadowBlur = 3;
    ctx.fillStyle = '#50ffe0'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.3, 0, tau); ctx.fill();
    ctx.shadowBlur = 0;
  }
  return function draw(time) {
    ctx.setTransform(canvas.width / 64, 0, 0, canvas.height / 64, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    ctx.save();
    ctx.beginPath(); ctx.arc(32, 32, 32, 0, tau); ctx.clip();
    ctx.fillStyle = '#03070B';
    ctx.fillRect(0, 0, 64, 64);
    const electrons = [0, 1, 2].map(ring => point(time * 1.55 + ring * tau / 3 + 0.05, ring));
    rings(false);
    electrons.filter(p => p.z < 0).forEach(electron);
    ctx.strokeStyle = 'rgba(37,179,238,0.75)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(32, 32, 10, 0, tau); ctx.stroke();
    const core = ctx.createRadialGradient(30, 30, 0, 32, 32, 6.5);
    core.addColorStop(0, '#c3fff5'); core.addColorStop(0.45, '#21ffe0'); core.addColorStop(1, '#00bd97');
    ctx.fillStyle = core; ctx.shadowColor = '#00ffc8'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(32, 32, 6, 0, tau); ctx.fill(); ctx.shadowBlur = 0;
    rings(true);
    electrons.filter(p => p.z >= 0).forEach(electron);
    ctx.restore();
  };
};
