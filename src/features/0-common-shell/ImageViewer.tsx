"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Button, Tag } from "@/components/mds";
import type { MdsElement } from "@/lib/types";
import styles from "./ImageViewer.module.css";

// 화면 이미지를 크게 띄워 확대·축소하며 보는 창. 뒤는 MDS 딤(--mds-bg-dim)으로 덮는다.
// - 100%는 이미지가 화면에 꽉 차는 크기다. 처음 열면 200%로 열리고 700%까지 확대할 수 있다.
// - 확대/축소: 아래 버튼, Ctrl(⌘)+휠·트랙패드 핀치, 키보드 + − 0(200%로 되돌리기)
// - 확대한 뒤에는 끌어서 이동
// - 닫기: X, Esc, 이미지 바깥 눌러서
// - 마우스 휠은 위아래 이동
// - 도구: 이동(V, 기본) / 손(H). 스페이스바를 누르고 있는 동안은 임시로 손 도구. 손 도구로만 끌어서 이동한다.
// - 이동 도구에서 화면 속 MDS 컴포넌트에 마우스를 올리면 그 자리에 박스와 설명(이름·변형·버전)이 뜬다.
interface ImageViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  /** 화면 속 MDS 컴포넌트와 위치. 화면 프레임 크기(frame)와 함께 줘야 올리기 설명이 뜬다. */
  elements?: MdsElement[];
  frame?: { width?: number; height?: number };
}

const MIN = 0.5;
const MAX = 7; // 700%
const INITIAL = 2; // 처음 열 때 200%
const STEP = 1.25;
// 이미지가 화면에 꽉 차는 배율(100%)로 200%를 만들 때, 긴 이미지는 가운데가 보이므로 위쪽 끝이 보이게 맞추는 이동값
function initialOffset(w: number, h: number) {
  const base = Math.min(
    (window.innerWidth * 0.9) / w,
    (window.innerHeight * 0.85) / h,
  );
  return {
    x: 0,
    y: Math.max(0, (h * base * INITIAL - window.innerHeight) / 2),
  };
}

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

export function ImageViewer({
  open,
  onClose,
  src,
  alt,
  elements,
  frame,
}: ImageViewerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // 이미지 원래 크기. 열었을 때 화면에 꽉 차게(작은 이미지는 키워서) 맞추는 데 쓴다.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // 도구: 이동(컴포넌트 설명 보기) / 손(끌어서 이동). 스페이스바를 누르는 동안은 임시로 손 도구.
  const [tool, setTool] = useState<"move" | "hand">("move");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const handActive = tool === "hand" || spaceHeld;
  // 마우스를 올린 컴포넌트와 설명 카드 위치
  const [hover, setHover] = useState<{
    element: MdsElement;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setScale(INITIAL);
      setOffset({ x: 0, y: 0 });
      setNatural(null);
      setTool("move");
      setSpaceHeld(false);
      setHover(null);
      element.showModal();
    }
    if (!open && element.open) element.close();
  }, [open]);

  // 가운데 버튼: 처음 열었을 때의 200%와 위치로 되돌린다.
  function resetZoom() {
    setScale(INITIAL);
    setOffset(natural ? initialOffset(natural.w, natural.h) : { x: 0, y: 0 });
  }

  function chooseTool(next: "move" | "hand") {
    setTool(next);
    setHover(null);
  }

  const zoom = useCallback((next: number) => {
    const value = clamp(next);
    setScale(value);
    if (value <= 1) setOffset({ x: 0, y: 0 });
  }, []);

  // 키보드: 이미지를 눌러 포커스가 창 밖으로 빠져도 먹도록 화면 전체에서 받는다.
  // 한글 자판이 켜져 있어도 먹도록 글자가 아니라 자판 위치(code)로 구분한다.
  const keyHandler = useRef<(event: KeyboardEvent, up: boolean) => void>(
    () => {},
  );
  useEffect(() => {
    keyHandler.current = (event, up) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") {
        // 스페이스는 원래 버튼을 누르거나 스크롤하는 키라서 막고, 누르는 동안만 손 도구로 쓴다
        event.preventDefault();
        setSpaceHeld(!up);
        if (!up) setHover(null);
        return;
      }
      if (up) return;
      if (event.key === "+" || event.key === "=") zoom(scale * STEP);
      if (event.key === "-") zoom(scale / STEP);
      if (event.key === "0") resetZoom();
      if (event.code === "KeyV") chooseTool("move");
      if (event.code === "KeyH") chooseTool("hand");
    };
  });
  useEffect(() => {
    if (!open) return;
    const down = (event: KeyboardEvent) => keyHandler.current(event, false);
    const up = (event: KeyboardEvent) => keyHandler.current(event, true);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [open]);

  // 마우스 휠: 위아래(옆으로도) 이동. Ctrl(Mac은 ⌘)을 누른 채 휠이나 트랙패드 핀치는 확대·축소.
  // 브라우저 기본 확대를 막으려면 passive가 아닌 리스너가 필요해서 직접 단다.
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoom(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
      } else {
        setOffset((current) => ({
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [open, scale, zoom]);

  function down(event: PointerEvent) {
    if (!handActive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  }

  function move(event: PointerEvent) {
    if (!drag.current) return;
    setHover(null); // 끄는 중에는 설명을 숨긴다
    setOffset({
      x: event.clientX - drag.current.x,
      y: event.clientY - drag.current.y,
    });
  }

  // 화면의 90% x 85% 안에 꽉 차는 크기 (100%의 기준)
  const fit = natural
    ? Math.min(
        (window.innerWidth * 0.9) / natural.w,
        (window.innerHeight * 0.85) / natural.h,
      )
    : 1;

  // 작은 컴포넌트가 위에 오도록, 넓이가 큰 것부터 아래에 깐다.
  const hits =
    frame?.width && frame.height && elements
      ? [...elements]
          .sort(
            (a, b) => b.box.width * b.box.height - a.box.width * a.box.height,
          )
          .map((element, index) => ({ element, layer: index + 1 }))
      : [];

  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      aria-label={`${alt} 크게 보기`}
      onClose={onClose}
      onClick={(event) => {
        // 이미지와 버튼이 아닌 바깥(딤) 영역을 누르면 닫는다
        if (
          event.target === event.currentTarget ||
          (event.target as HTMLElement).dataset.stage
        )
          onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.stage} data-stage="true">
            <div
              className={styles.sheet}
              style={
                {
                  width: natural ? natural.w * fit : undefined,
                  height: natural ? natural.h * fit : undefined,
                  visibility: natural ? "visible" : "hidden",
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  cursor: handActive ? "grab" : "default",
                  "--zoom": scale,
                } as CSSProperties
              }
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma가 주는 임시 이미지 주소라 next/image를 쓰지 않는다 */}
              <img
                className={styles.image}
                src={src}
                alt={alt}
                draggable={false}
                onLoad={(event) => {
                  const w = event.currentTarget.naturalWidth;
                  const h = event.currentTarget.naturalHeight;
                  setNatural({ w, h });
                  // 처음 200%로 열면 긴 이미지는 가운데가 보이므로, 위쪽 끝이 보이게 맞춘다.
                  setOffset(initialOffset(w, h));
                }}
              />
              {hits.map(({ element, layer }) => (
                <div
                  key={element.id}
                  className={`${styles.hit} ${hover?.element.id === element.id ? styles.hitOn : ""}`}
                  style={{
                    left: `${(element.box.x / frame!.width!) * 100}%`,
                    top: `${(element.box.y / frame!.height!) * 100}%`,
                    width: `${(element.box.width / frame!.width!) * 100}%`,
                    height: `${(element.box.height / frame!.height!) * 100}%`,
                    zIndex: layer,
                    pointerEvents: handActive ? "none" : undefined,
                  }}
                  onPointerMove={(event) => {
                    if (drag.current) return;
                    setHover({
                      element,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onPointerLeave={() =>
                    setHover((current) =>
                      current?.element.id === element.id ? null : current,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {hover && (
            <div
              className={styles.tooltip}
              style={{
                left: Math.min(hover.x + 16, window.innerWidth - 296),
                top: Math.min(hover.y + 16, window.innerHeight - 120),
              }}
            >
              <div className={styles.tooltipTitle}>
                <strong className={styles.tooltipName}>
                  {hover.element.component}
                </strong>
                <Tag>{hover.element.mdsVersion}</Tag>
              </div>
              {hover.element.variant && (
                <ul className={styles.tooltipVariant}>
                  {hover.element.variant.split(", ").map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="닫기"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- MDS 아이콘 SVG를 그대로 쓴다 */}
            <img src="/mds-icons/x-close.svg" alt="" width={24} height={24} />
          </button>

          <div className={styles.controls}>
            <Button
              size="small"
              variant={handActive ? "secondary" : "primary"}
              aria-pressed={!handActive}
              aria-label="이동 도구 (V)"
              title="이동 (V)"
              onClick={() => chooseTool("move")}
            >
              <span className={`${styles.toolIcon} ${styles.toolMove}`} />V
            </Button>
            <Button
              size="small"
              variant={handActive ? "primary" : "secondary"}
              aria-pressed={handActive}
              aria-label="손 도구 (H, 스페이스바)"
              title="손 (H, 스페이스바)"
              onClick={() => chooseTool("hand")}
            >
              <span className={`${styles.toolIcon} ${styles.toolHand}`} />H
            </Button>
            <Button
              size="small"
              variant="secondary"
              aria-label="축소"
              disabled={scale <= MIN}
              onClick={() => zoom(scale / STEP)}
            >
              −
            </Button>
            <Button size="small" variant="secondary" onClick={resetZoom}>
              {Math.round(scale * 100)}%
            </Button>
            <Button
              size="small"
              variant="secondary"
              aria-label="확대"
              disabled={scale >= MAX}
              onClick={() => zoom(scale * STEP)}
            >
              +
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
