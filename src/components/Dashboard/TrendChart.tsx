import { useRef, useEffect, useCallback, useState } from 'react';

export interface TrendDataPoint {
  date: string;
  value: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  metricName: string;
  unit: string;
  refRangeLow?: number;
  refRangeHigh?: number;
}

interface Tooltip {
  x: number;
  y: number;
  date: string;
  value: number;
}

const PADDING = { top: 28, right: 24, bottom: 48, left: 56 };
const DOT_RADIUS = 4;
const DOT_HIT_RADIUS = 12;

export default function TrendChart({ data, metricName, unit, refRangeLow, refRangeHigh }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [size, setSize] = useState({ w: 600, h: 260 });

  // Sort data by date ascending
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

  // Compute value range with padding
  const values = sorted.map(d => d.value);
  const allValues = [...values];
  if (refRangeLow != null) allValues.push(refRangeLow);
  if (refRangeHigh != null) allValues.push(refRangeHigh);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;
  const yMin = minVal - valRange * 0.1;
  const yMax = maxVal + valRange * 0.1;

  const toCanvasX = useCallback((i: number) => {
    const plotW = size.w - PADDING.left - PADDING.right;
    return PADDING.left + (sorted.length === 1 ? plotW / 2 : (i / (sorted.length - 1)) * plotW);
  }, [size.w, sorted.length]);

  const toCanvasY = useCallback((v: number) => {
    const plotH = size.h - PADDING.top - PADDING.bottom;
    return PADDING.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  }, [size.h, yMin, yMax]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.max(220, Math.min(300, Math.floor(w * 0.4)));
        setSize({ w, h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Read CSS custom properties from the canvas element
    const cs = getComputedStyle(canvas);
    const colorTx = cs.getPropertyValue('--color-tx').trim() || '#f1f5f9';
    const colorTxMuted = cs.getPropertyValue('--color-tx-muted').trim() || '#94a3b8';
    const colorTxFaint = cs.getPropertyValue('--color-tx-faint').trim() || '#4b5563';
    const colorPrimary = cs.getPropertyValue('--color-primary').trim() || '#22d3ee';
    const colorSuccess = cs.getPropertyValue('--color-success').trim() || '#4ade80';
    const colorDivider = cs.getPropertyValue('--color-divider').trim() || 'rgba(255,255,255,0.06)';

    // Clear
    ctx.clearRect(0, 0, size.w, size.h);

    const plotW = size.w - PADDING.left - PADDING.right;
    const plotH = size.h - PADDING.top - PADDING.bottom;

    // Reference range band
    if (refRangeLow != null && refRangeHigh != null) {
      const ry1 = toCanvasY(refRangeHigh);
      const ry2 = toCanvasY(refRangeLow);
      ctx.fillStyle = colorSuccess.startsWith('#')
        ? colorSuccess + '18'
        : colorSuccess.replace(/[\d.]+\)$/, '0.09)');
      ctx.fillRect(PADDING.left, ry1, plotW, ry2 - ry1);

      // Dashed lines at boundaries
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colorSuccess.startsWith('#')
        ? colorSuccess + '55'
        : colorSuccess.replace(/[\d.]+\)$/, '0.33)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, ry1);
      ctx.lineTo(PADDING.left + plotW, ry1);
      ctx.moveTo(PADDING.left, ry2);
      ctx.lineTo(PADDING.left + plotW, ry2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.font = `500 ${10}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = colorSuccess;
      ctx.textAlign = 'right';
      ctx.fillText(`${refRangeHigh}`, PADDING.left - 6, ry1 + 3);
      ctx.fillText(`${refRangeLow}`, PADDING.left - 6, ry2 + 3);
    }

    // Grid lines (horizontal)
    const yTicks = 5;
    ctx.strokeStyle = colorDivider;
    ctx.lineWidth = 1;
    ctx.font = `400 ${10}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = colorTxFaint;
    ctx.textAlign = 'right';

    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (i / yTicks) * (yMax - yMin);
      const y = toCanvasY(v);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(v % 1 === 0 ? 0 : 1), PADDING.left - 8, y + 3);
    }

    // X-axis date labels
    ctx.textAlign = 'center';
    ctx.fillStyle = colorTxMuted;
    ctx.font = `400 ${10}px Inter, system-ui, sans-serif`;

    const maxLabels = Math.floor(plotW / 70);
    const step = Math.max(1, Math.ceil(sorted.length / maxLabels));
    for (let i = 0; i < sorted.length; i += step) {
      const x = toCanvasX(i);
      const d = new Date(sorted[i].date);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx.fillText(label, x, size.h - PADDING.bottom + 18);
    }
    // Always show last label if not shown
    if ((sorted.length - 1) % step !== 0 && sorted.length > 1) {
      const x = toCanvasX(sorted.length - 1);
      const d = new Date(sorted[sorted.length - 1].date);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx.fillText(label, x, size.h - PADDING.bottom + 18);
    }

    // Draw line
    if (sorted.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = colorPrimary;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let i = 0; i < sorted.length; i++) {
        const x = toCanvasX(i);
        const y = toCanvasY(sorted[i].value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Gradient fill under line
      const grad = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + plotH);
      grad.addColorStop(0, colorPrimary.startsWith('#')
        ? colorPrimary + '30'
        : colorPrimary.replace(/[\d.]+\)$/, '0.19)'));
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      for (let i = 0; i < sorted.length; i++) {
        const x = toCanvasX(i);
        const y = toCanvasY(sorted[i].value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(toCanvasX(sorted.length - 1), PADDING.top + plotH);
      ctx.lineTo(toCanvasX(0), PADDING.top + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Draw dots
    for (let i = 0; i < sorted.length; i++) {
      const x = toCanvasX(i);
      const y = toCanvasY(sorted[i].value);

      // Outer glow
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS + 2, 0, Math.PI * 2);
      ctx.fillStyle = colorPrimary.startsWith('#')
        ? colorPrimary + '40'
        : colorPrimary.replace(/[\d.]+\)$/, '0.25)');
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colorPrimary;
      ctx.fill();

      // White center
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = colorTx;
      ctx.fill();
    }

    // Unit label
    ctx.save();
    ctx.translate(12, PADDING.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = colorTxFaint;
    ctx.font = `500 ${10}px Inter, system-ui, sans-serif`;
    ctx.fillText(unit, 0, 0);
    ctx.restore();
  }, [sorted, size, toCanvasX, toCanvasY, refRangeLow, refRangeHigh, yMin, yMax, unit]);

  // Mouse move handler for tooltips
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (let i = 0; i < sorted.length; i++) {
      const x = toCanvasX(i);
      const y = toCanvasY(sorted[i].value);
      const dx = mx - x;
      const dy = my - y;
      if (dx * dx + dy * dy < DOT_HIT_RADIUS * DOT_HIT_RADIUS) {
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, date: sorted[i].date, value: sorted[i].value });
        return;
      }
    }
    setTooltip(null);
  }, [sorted, toCanvasX, toCanvasY]);

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)' }}>
        No data points available for {metricName}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: size.h, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y - 44,
            transform: 'translateX(-50%)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-tx)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-md)',
            zIndex: 10,
          }}
        >
          <strong>{tooltip.value} {unit}</strong>
          <div style={{ color: 'var(--color-tx-muted)', marginTop: 2 }}>
            {new Date(tooltip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  );
}
