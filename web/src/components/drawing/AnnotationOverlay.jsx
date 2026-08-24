import { PinMarker } from './PinMarker'
import { calculateNormalizedCoords } from '../../lib/drawingCoords'

export function AnnotationOverlay({
  annotations = [],
  pageNumber,
  pinMode,
  selectedId,
  onPinClick,
  onBlankClick,
}) {
  const pagePins = annotations.filter(
    (a) => a.type === 'pin' && Number(a.page_number) === Number(pageNumber)
  )

  function handleClick(e) {
    if (!pinMode) return
    const layer = e.currentTarget
    const coords = calculateNormalizedCoords(e, layer)
    onBlankClick?.(coords)
  }

  return (
    <div
      className={`dwg-overlay${pinMode ? ' pin-mode' : ''}`}
      onClick={handleClick}
      role="presentation"
    >
      {pagePins.map((ann, i) => (
        <PinMarker
          key={ann.id}
          annotation={ann}
          index={i}
          selected={selectedId === ann.id}
          onClick={onPinClick}
        />
      ))}
    </div>
  )
}
