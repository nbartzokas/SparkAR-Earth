const Patches = require("Patches");
const Reactive = require("Reactive");
const Scene = require("Scene");
const Time = require("Time");
export const Diagnostics = require("Diagnostics");

import * as d3 from "./d3.min.js"; // https://cdnjs.cloudflare.com/ajax/libs/d3/5.16.0/d3.min.js
import countries110m from "./countries-110m"; // https://github.com/topojson/world-atlas converted to geojson
import {
  eulerToRotationMatrix,
  matrixTranspose,
  modelToTextureSpherical,
  raycastToSphere,
  throttle,
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

const countriesByName = countries110m.features.reduce(
  (a, c) => Object.assign(a, { [c.properties.name]: c }),
  {}
);
const countryNames = countries110m.features.map((f) => f.properties.name);

// Game state
const states = {
  GAME_START: "GAME_START",
  ROUND_STARTING: "ROUND_STARTING",
  ROUND_STARTED: "ROUND_STARTED",
  ROUND_WIN: "ROUND_WIN",
  ROUND_TIMEOUT: "ROUND_TIMEOUT",
  GAME_END: "GAME_END",
};
let state = states.GAME_START;
let targetCountry = null;

// get directional light, calculate its rotation matrix, and return as signals
Promise.all([
  Scene.root.findFirst("Camera"),
  Scene.root.findFirst("Sun"),
  Scene.root.findFirst("Earth"),
  Scene.root.findFirst("CountryText"),
  Scene.root.findFirst("CursorContainer"),
]).then(function ([camera, sun, earth, countriesText, cursorContainer]) {
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

    // export rotation to get cursor looking at globe center
    const lookAtTransform = cursorContainer.transform
      .toSignal()
      .lookAt(Reactive.point(0, 0, 0));
    Patches.inputs.setVector(
      "rModel",
      Reactive.vector(
        lookAtTransform.rotationX,
        lookAtTransform.rotationY,
        lookAtTransform.rotationZ
      )
    );

    // convert model space to uv space
    const uv = modelToTextureSpherical(pModel);
    Patches.inputs.setPoint2D("uv", Reactive.pack2(uv.x, uv.y));

    // update loop / state machine
    const gameNumRounds = 3;
    const roundTimeLimit = 20000;
    let roundsLeft = gameNumRounds;
    let roundStartTime = 0;

    let oldState;
    let newState;
    function setState(_newState, timeout = 0) {
      if (newState === _newState) {
        // already setting this state with timeout
        return;
      }
      if (oldState === _newState) {
        // already set as this state
        return;
      }
      newState = _newState;
      Time.setTimeout(() => {
        state = newState;
        Patches.inputs.setString("state", state);
        Diagnostics.log("state set to: " + state);
        oldState = state;
      }, timeout);
    }

    Time.ms.interval(1000).subscribe((t) => {
      switch (state) {
        case states.GAME_START: {
          // show TitlePane, hide others
          //   show Title, hide others
          //   show Instruction0
          //   show Instruction1
          // then...
          setState(states.ROUND_STARTING);
          break;
        }
        case states.ROUND_STARTING: {
          if (roundsLeft === 0) {
            setState(states.GAME_END);
            break;
          }
          setState(states.ROUND_STARTED);
          // randomly select country prompt
          targetCountry =
            countryNames[Math.floor(countryNames.length * Math.random())];
          Patches.inputs.setString("targetCountry", targetCountry);
          Diagnostics.log("find: " + targetCountry);
          roundStartTime = t;
          roundsLeft--;
          break;
        }
        case states.ROUND_STARTED: {
          if (t > roundStartTime + roundTimeLimit) {
            setState(states.ROUND_TIMEOUT);
          }
          break;
        }
        case states.ROUND_WIN: {
          // stop user interaction
          // report win
          // trigger new round with delay
          setState(states.ROUND_STARTING, 1500);
          break;
        }
        case states.ROUND_TIMEOUT: {
          // stop user interaction
          // report loss
          // trigger new round
          setState(states.ROUND_STARTING, 2000);
          break;
        }
        case states.GAME_END: {
          break;
        }
        default:
          break;
      }
    });
    Patches.inputs.setString("state", state);

    // lookup country
    const { lon, lat } = uvToLatLon(uv);
    const listener = Reactive.monitorMany([lon, lat]);
    const selectionThrottle = 166;
    let selected = true; // TODO: stopping usage of this flag for now
    let selectedCountry;
    let selectedFeature;
    const handleLatLonChange = throttle(function (event) {
      if (state === states.ROUND_STARTED) {
        const lon = event.newValues["0"];
        const lat = event.newValues["1"];

        if (
          state === states.ROUND_STARTED &&
          d3.geoContains(countriesByName[targetCountry], [lon, lat])
        ) {
          setState(states.ROUND_WIN);
        }

        // // TODO: consider a tree-based optimization or checking for rational distance first
        // // TODO: also consider smoothing this signal, or only caring about changes greater than x
        // if (selectedFeature) {
        //   if (d3.geoContains(selectedFeature, [lon, lat])) {
        //     return;
        //   }
        // }
        // Patches.inputs.setBoolean("selected", false);
        // selectedCountry = "none";
        // selectedFeature = null;
        // countries110m.features.forEach((feature) => {
        //   if (d3.geoContains(feature, [lon, lat])) {
        //     selectedFeature = feature;
        //     selectedCountry = feature.properties.name;
        //   }
        // });
        // selected = selectedCountry !== "none";
        // countriesText.text = selectedCountry;
        // if (
        //   selectedCountry === targetCountry &&
        //   state === states.ROUND_STARTED
        // ) {
        //   state = states.ROUND_WIN;
        // }
        // Patches.inputs.setBoolean("selected", selected);
      }
    }, selectionThrottle);
    listener.subscribe(handleLatLonChange);
    Patches.inputs.setBoolean("selected", selected);

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
