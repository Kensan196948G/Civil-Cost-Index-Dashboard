// フォールバック: middleware がルートを /standalone.html に書き換えるが、
// 静的エクスポートや middleware 非適用時でも URL を変えずに表示する
export default function RootPage() {
  return (
    <iframe
      src="/standalone.html"
      title="Civil Cost Index Dashboard"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
    />
  );
}
