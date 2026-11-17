import React, { useRef, useState } from 'react';
import { ArrowUp, Flashlight, Footprints, Hand } from 'lucide-react';
import { NearbyInteractable } from '../scene/presets';

interface MobileControlsProps {
  flashlightOn: boolean;
  sprinting: boolean;
  nearbyInteractable: NearbyInteractable | null;
  onMoveVector: (x: number, y: number) => void;
  onJump: () => void;
  onInteract: () => void;
  onToggleSprint: () => void;
  onToggleFlashlight: () => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  flashlightOn,
  sprinting,
  nearbyInteractable,
  onMoveVector,
  onJump,
  onInteract,
  onToggleSprint,
  onToggleFlashlight,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const maxRadius = 38;

  const updateStick = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onMoveVector(dx / maxRadius, -dy / maxRadius);
  };

  const resetStick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onMoveVector(0, 0);
  };

  return (
    <>
      {/* Bottom-Left Virtual Analog Joystick */}
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerId.current = e.pointerId;
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          e.stopPropagation();
          updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activePointerId.current !== e.pointerId) return;
          e.stopPropagation();
          resetStick();
        }}
        onPointerCancel={resetStick}
        className="pointer-events-auto fixed bottom-28 left-5 z-20 flex h-28 w-28 touch-none items-center justify-center rounded-full border border-slate-600/80 bg-[#0c121e]/88 shadow-xl sm:bottom-24 sm:left-7"
        aria-label="Joystick de déplacement"
      >
        <div className="pointer-events-none absolute inset-3 rounded-full border border-slate-700/60" />
        <div
          className="pointer-events-none h-11 w-11 rounded-full border border-sky-300/60 bg-sky-500/35 shadow-md"
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
        />
      </div>

      {/* Bottom-Right Tactile Action Buttons */}
      <div className="pointer-events-auto fixed bottom-28 right-5 z-20 flex flex-col items-end gap-2.5 sm:bottom-24 sm:right-7">
        {nearbyInteractable && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onInteract();
            }}
            aria-label={nearbyInteractable.actionLabel}
            className="flex h-12 items-center gap-2 rounded-full border border-amber-400/75 bg-amber-500/30 px-4 text-xs font-semibold text-amber-100 shadow-lg active:bg-amber-500/50 cursor-pointer"
          >
            <Hand className="h-4 w-4" />
            <span>{nearbyInteractable.actionLabel}</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleFlashlight();
            }}
            aria-label="Lampe torche"
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors cursor-pointer ${
              flashlightOn
                ? 'border-amber-400/70 bg-amber-500/25 text-amber-200'
                : 'border-slate-600/80 bg-[#0c121e]/88 text-slate-300'
            }`}
          >
            <Flashlight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleSprint();
            }}
            aria-label="Courir"
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors cursor-pointer ${
              sprinting
                ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-200'
                : 'border-slate-600/80 bg-[#0c121e]/88 text-slate-300'
            }`}
          >
            <Footprints className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onJump();
          }}
          aria-label="Sauter"
          className="flex h-13 w-13 items-center justify-center rounded-full border border-sky-400/60 bg-sky-500/25 text-sky-100 shadow-lg active:bg-sky-500/45 cursor-pointer"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </>
  );
};
