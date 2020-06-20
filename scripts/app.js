const Patches = require("Patches");
const Reactive = require("Reactive");
const Scene = require("Scene");
export const Diagnostics = require("Diagnostics");

import * as d3 from "./d3.min.js"; // https://cdnjs.cloudflare.com/ajax/libs/d3/5.16.0/d3.min.js
import countries110m from "./countries-110m"; // https://github.com/topojson/world-atlas converted to geojson
import {
  eulerToRotationMatrix,
  matrixTranspose,
  modelToTextureSpherical,
  raycastToSphere,
  transformToForward,
  uvToLatLon,
  worldToModel,
} from "./utils";

// The Hires Sphere model from the Spark AR Library
// has a radius of 0.025 in coordiante space, and
// has a texture mapping that is slightly
// offset along the x axis
const BASE_MODEL_RADIUS = 0.025;
const BASE_MODEL_TEXTURE_MAP_OFFSET_X = 0.033;

// get directional light, calculate its rotation matrix, and return as signals
Promise.all([
  Scene.root.findFirst("Camera"),
  Scene.root.findFirst("Sun"),
  Scene.root.findFirst("Earth"),
  Scene.root.findFirst("CountryText"),
]).then(function ([camera, sun, earth, countriesText]) {
  try {
    outputSunRotationMatrix(sun);

    // Get Camera origin, direction
    const cameraWorldTransform = camera.worldTransform;
    const cameraOrigin = cameraWorldTransform.position;
    const cameraDirection = transformToForward(cameraWorldTransform);

    // Get Earth position, radius
    const earthWorldTransform = earth.worldTransform;
    const earthPosition = earthWorldTransform.position;
    const earthRadius = earthWorldTransform.scaleX.mul(BASE_MODEL_RADIUS); // assumes x=y=z

    // output point on sphere
    const p = raycastToSphere(
      earthPosition,
      earthRadius,
      cameraOrigin,
      cameraDirection
    );
    Patches.inputs.setVector("pWorld", Reactive.vector(p.x, p.y, p.z));

    // convert p world to model
    const pModel = worldToModel(p, earthWorldTransform);
    Patches.inputs.setVector("pModel", pModel);

    // convert model space to uv space
    const uv = modelToTextureSpherical(pModel);
    Patches.inputs.setPoint2D("uv", Reactive.pack2(uv.x, uv.y));

    // look up the color and output it
    // TODO: do you need this?
    // const color = Shaders.textureSampler(countriesTexture.signal, uv); // shader signal
    // outputColorMaterial.setTextureSlot(
    //   Shaders.DefaultMaterialTextures.DIFFUSE,
    //   color
    // );

    // lookup country
    const { lon, lat } = uvToLatLon(uv);
    const listener = Reactive.monitorMany([lon, lat]);
    let selectedCountry;
    listener.subscribe((event) => {
      const lon = event.newValues["0"];
      const lat = event.newValues["1"];
      // TODO: consider a tree-based optimization or checking for rational distance first
      // TODO: also consider smoothing this signal, or only caring about changes greater than x
      countries110m.features.forEach((feature) => {
        if (d3.geoContains(feature, [lon, lat])) {
          selectedCountry = feature.properties.name;
        }
      });
      countriesText.text = selectedCountry;
      // Diagnostics.log(
      //   "[" + Math.round(lon) + "," + Math.round(lat) + "] " + selectedCountry
      // );
    });

    Diagnostics.log("done");
  } catch (e) {
    Diagnostics.log("error " + e);
    Diagnostics.log("error " + e.stack);
  }
});

/**
 * Find and export Sun rotation matrix
 * (Doing this in script since there seems to be no way
 * to get an object transform input in patch.)
 */
function outputSunRotationMatrix(sun) {
  const sunTransform = sun.transform;
  // TODO: pick row-major or column-major, see if Spark AR has a preferred convention
  const [m0, m1, m2] = matrixTranspose(
    eulerToRotationMatrix(
      sunTransform.rotationX,
      sunTransform.rotationY,
      sunTransform.rotationZ
    )
  );
  Patches.inputs.setVector("m0", m0);
  Patches.inputs.setVector("m1", m1);
  Patches.inputs.setVector("m2", m2);
}
