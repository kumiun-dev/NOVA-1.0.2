"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden rounded-md bg-[#16181A] px-5 py-2 text-[13px] text-white"
    >
      打印 / 另存为 PDF
    </button>
  );
}
