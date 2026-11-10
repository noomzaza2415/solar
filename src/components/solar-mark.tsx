import React from "react";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

// ไอคอนแบรนด์ข้างหัวข้อ: แผงโซล่ากับพระอาทิตย์ แบบเรียบสีเดียว
//
// หน้านี้ทำไว้ให้ผู้บริหารดู จึงใช้สไตล์แบน สีเดียวตาม palette.accent แบบไอคอนในระบบองค์กร
// (รุ่นก่อนไล่สีส้ม-ฟ้ามีแสงสะท้อน ดูเป็นแอปทั่วไปมากกว่าระบบงาน)
//
// เส้นแบ่งเซลล์บนแผงใช้สีพื้นของกรอบ (backgroundColor) จึงอ่านเป็นช่องว่างระหว่างเซลล์
// ทั้งโหมดสว่างและมืด ไม่ใช่เส้นขาวตายตัวที่จ้าเกินไปบนพื้นเข้ม

type SolarMarkProps = {
  size?: number;
  color: string;
  backgroundColor: string;
};

// แผงหน้าตรง 4 x 3 เซลล์
const PANEL = { x: 3, y: 12, width: 22, height: 14, radius: 1.6 };
const COLUMNS = 4;
const ROWS = 3;

// พระอาทิตย์มุมขวาบน ซ้อนหลังแผงเล็กน้อย รังสีเฉพาะด้านที่ไม่ถูกแผงบัง
const SUN = { cx: 24, cy: 9, r: 3.6 };
const RAY_ANGLES = [-90, -45, 0, 45];

export function SolarMark({ size = 28, color, backgroundColor }: SolarMarkProps) {
  const cellWidth = PANEL.width / COLUMNS;
  const cellHeight = PANEL.height / ROWS;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <G stroke={color} strokeWidth={1.6} strokeLinecap="round">
        {RAY_ANGLES.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <Line
              key={deg}
              x1={SUN.cx + Math.cos(rad) * (SUN.r + 1.6)}
              y1={SUN.cy + Math.sin(rad) * (SUN.r + 1.6)}
              x2={SUN.cx + Math.cos(rad) * (SUN.r + 3.4)}
              y2={SUN.cy + Math.sin(rad) * (SUN.r + 3.4)}
            />
          );
        })}
      </G>
      <Circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill={color} />

      {/* ขอบสีพื้นรอบแผง ตัดพระอาทิตย์ส่วนที่ซ้อนอยู่ให้แยกจากกันชัด */}
      <Rect
        x={PANEL.x}
        y={PANEL.y}
        width={PANEL.width}
        height={PANEL.height}
        rx={PANEL.radius}
        fill={color}
        stroke={backgroundColor}
        strokeWidth={1.6}
      />
      <G stroke={backgroundColor} strokeWidth={0.9}>
        {Array.from({ length: COLUMNS - 1 }, (_, i) => {
          const x = PANEL.x + cellWidth * (i + 1);
          return <Line key={`c${i}`} x1={x} y1={PANEL.y} x2={x} y2={PANEL.y + PANEL.height} />;
        })}
        {Array.from({ length: ROWS - 1 }, (_, i) => {
          const y = PANEL.y + cellHeight * (i + 1);
          return <Line key={`r${i}`} x1={PANEL.x} y1={y} x2={PANEL.x + PANEL.width} y2={y} />;
        })}
      </G>

      {/* ขาตั้ง */}
      <Path
        d="M14 26v3.2 M9.5 29.2h9"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}
