export default function RefusalBanner({ refusal }) {
  return (
    <div className="refusal" role="alert">
      <code>{refusal.code}</code>
      <span>{refusal.reason}</span>
    </div>
  );
}
