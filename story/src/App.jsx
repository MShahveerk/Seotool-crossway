import { useScrollDriver } from "./scene/useScrollDriver.js";
import { CanvasRoot } from "./scene/CanvasRoot.jsx";
import { Overlay } from "./overlay/Overlay.jsx";

export default function App() {
  useScrollDriver();
  return (
    <>
      <CanvasRoot />
      <Overlay />
    </>
  );
}
