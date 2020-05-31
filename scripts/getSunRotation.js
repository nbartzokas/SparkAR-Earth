const Reactive = require("Reactive");
const Scene = require("Scene");
const Patches = require("Patches");
export const Diagnostics = require("Diagnostics");

// get directional light, calculate its rotation matrix, and return as signals
Promise.all([Scene.root.findFirst("Sun")]).then(function (objects) {
  const sun = objects[0];
  try {
    const t = sun.transform;

    const x = t.rotationX;
    const y = t.rotationY;
    const z = t.rotationZ;

    const sx = Reactive.sin(x);
    const cx = Reactive.cos(x);
    const sy = Reactive.sin(y);
    const cy = Reactive.cos(y);
    const sz = Reactive.sin(z);
    const cz = Reactive.cos(z);

    const m00 = Reactive.mul(cy, cz);
    const m01 = Reactive.sub(
      Reactive.mulList([cz, sx, sy]),
      Reactive.mulList([cx, sz])
    );
    const m02 = Reactive.add(
      Reactive.mulList([cx, cz, sy]),
      Reactive.mulList([sx, sz])
    );
    const m10 = Reactive.mul(cy, sz);
    const m11 = Reactive.add(
      Reactive.mulList([sx, sy, sz]),
      Reactive.mulList([cx, cz])
    );
    const m12 = Reactive.sub(
      Reactive.mulList([cx, sy, sz]),
      Reactive.mulList([cz, sx])
    );
    const m20 = Reactive.neg(sy);
    const m21 = Reactive.mul(cy, sx);
    const m22 = Reactive.mul(cx, cy);

    Patches.inputs.setVector("m0", Reactive.vector(m00, m10, m20));
    Patches.inputs.setVector("m1", Reactive.vector(m01, m11, m21));
    Patches.inputs.setVector("m2", Reactive.vector(m02, m12, m22));

    Diagnostics.log("done");
  } catch (e) {
    Diagnostics.log("error");
  }
});
