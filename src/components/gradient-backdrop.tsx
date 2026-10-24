/** Fixed, decorative abstract gradient that sits behind every page. */
export function GradientBackdrop() {
  return (
    <div className="backdrop-root" aria-hidden>
      <div className="backdrop-blob b1" />
      <div className="backdrop-blob b2" />
      <div className="backdrop-blob b3" />
      <div className="backdrop-blob b4" />
      <div className="backdrop-grid" />
      <div className="backdrop-noise" />
    </div>
  )
}
