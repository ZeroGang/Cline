export function LoadingOverlay({ text }: { text: string }) {
  return (
    <div className="ld-ov" id="ldOv">
      <img className="ld-logo-icon" src="/favicon.svg" alt="" width={72} height={72} decoding="async" />
      <div className="ld-brand">Cline</div>
      <div className="ld-txt" id="ldTxt">
        {text}
      </div>
      <div className="ld-bar-wrap">
        <div className="ld-bar-fill" />
      </div>
    </div>
  )
}
