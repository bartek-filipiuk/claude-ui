export function Brand() {
  return (
    <div className="brand">
      <div className="mark" aria-hidden>
        CH
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span className="word">codehelm</span>
        <span className="sub">local</span>
      </div>
      <div className="status">
        <span className="dot" />
        127.0.0.1
      </div>
    </div>
  );
}
