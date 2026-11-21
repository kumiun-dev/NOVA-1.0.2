"use client";
import { useEffect, useRef } from "react";

export default function TechBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let width = innerWidth;
    let height = innerHeight;
    const pointer = { x: -1000, y: -1000 };
    const points = Array.from({ length: 38 }, () => ({ x: Math.random(), y: Math.random(), phase: Math.random() * 6.28 }));
    const resize = () => {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = width * ratio; element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const leave = () => { pointer.x = -1000; pointer.y = -1000; };
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      for (const point of points) {
        const x = point.x * width + Math.sin(time / 7000 + point.phase) * 12;
        const y = point.y * height + Math.cos(time / 8000 + point.phase) * 12;
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        context.fillStyle = distance < 180 ? "rgba(104,80,209,.45)" : "rgba(104,80,209,.15)";
        context.beginPath(); context.arc(x, y, distance < 180 ? 2 : 1.2, 0, Math.PI * 2); context.fill();
        if (distance < 180) {
          context.strokeStyle = `rgba(104,80,209,${(1 - distance / 180) * .16})`;
          context.beginPath(); context.moveTo(x, y); context.lineTo(pointer.x, pointer.y); context.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return <canvas ref={canvas} aria-hidden="true" className="nova-tech-canvas" />;
}
