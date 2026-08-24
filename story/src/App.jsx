import { useScrollDriver } from "./scene/useScrollDriver.js";
import { Mascot } from "./mascot/Mascot.jsx";
import { Overlay } from "./overlay/Overlay.jsx";

export default function App() {
  useScrollDriver();
  return (
    <>
      <Mascot />
      <Overlay />
    </>
  );
}
