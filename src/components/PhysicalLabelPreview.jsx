import { useEffect, useRef } from "react";
import { renderLabelCanvas } from "../lib/labelLayout";

export default function PhysicalLabelPreview({ entry, size, opts, store = "", settings = {} }) {
  const ref = useRef(null);
  const key = JSON.stringify([entry, size, opts, store, settings]);
  useEffect(() => {
    const image = renderLabelCanvas(entry, { size, opts, store, settings });
    const canvas = ref.current;
    canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
  }, [key]);
  return <canvas ref={ref} aria-label="Aperçu de l'étiquette"
    className="block bg-white"
    style={{ width: 320, maxWidth: "100%", height: "auto", imageRendering: "pixelated" }} />;
}
