const Animation = require("Animation");
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

const SELECTED_NONE_TEXT = "...";

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
  EXPLORE: "EXPLORE",
};
const statesValues = Object.values(states);
let state = states.EXPLORE;
let targetCountry = null;

// get directional light, calculate its rotation matrix, and return as signals
Promise.all([
  Scene.root.findFirst("Camera"),
  Scene.root.findFirst("Sun"),
  Scene.root.findFirst("Earth"),
  Scene.root.findFirst("CountryText"),
  Scene.root.findFirst("CursorContainer"),
  Scene.root.findFirst("GameOverText"),
  Scene.root.findFirst("ExploreCountryText"),
  Scene.root.findFirst("FireworkRed"),
  Scene.root.findFirst("FireworkGreen"),
  Scene.root.findFirst("FireworkBlue"),
  Patches.outputs.getString("stateRequest"),
]).then(function ([
  camera,
  sun,
  earth,
  countriesText,
  cursorContainer,
  gameOverText,
  exploreCountryText,
  fireworkRed,
  fireworkGreen,
  fireworkBlue,
  stateRequest,
]) {
  try {
    const colorArray = Animation.samplers.easeInCubic(
      [1, 1, 1, 1],
      [1, 1, 1, 0]
    );
    const colorSampler = Animation.samplers.HSVA(colorArray);
    fireworkRed.colorModulationHSVA = Reactive.HSVA(0, 1, 1, 1);
    fireworkRed.colorModulationHSVADelta = Reactive.HSVA(0.1, 0, 0, 0);
    fireworkRed.hsvaColorModulationModifier = colorSampler;
    fireworkGreen.colorModulationHSVA = Reactive.HSVA(0.33, 1, 1, 1);
    fireworkGreen.colorModulationHSVADelta = Reactive.HSVA(0.1, 0, 0, 0);
    fireworkGreen.hsvaColorModulationModifier = colorSampler;
    fireworkBlue.colorModulationHSVA = Reactive.HSVA(0.67, 1, 1, 1);
    fireworkBlue.colorModulationHSVADelta = Reactive.HSVA(0.1, 0, 0, 0);
    fireworkBlue.hsvaColorModulationModifier = colorSampler;

    // scale shrink over time
    //

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

    const nTotal = 3;
    Patches.inputs.setScalar("nTotal", nTotal);

    const roundTimeLimit = 20000;
    let roundsLeft = nTotal;
    let roundStartTime = 0;

    let oldState;
    let newState;

    function setState(_newState, timeout = 0) {
      if (statesValues.indexOf(_newState) === -1) {
        Diagnostics.log("Invalid state " + _newState);
        return;
      }
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

    stateRequest.monitor().subscribe(({ oldValue, newValue }) => {
      Diagnostics.log(
        "Received state request. old:" + oldValue + " new:" + newValue
      );
      setState(newValue);
    });

    let nCorrect = 0;
    Patches.inputs.setScalar("nCorrect", nCorrect);

    let lastTimeReported = Infinity;
    Time.ms.interval(64).subscribe((t) => {
      const msRemaining = roundTimeLimit - (t - roundStartTime);
      const sRemaining = Math.floor(msRemaining / 1000);
      switch (state) {
        case states.GAME_START: {
          // At GAME_START, the node network will:
          // * show Title and instructions
          // * request state of ROUND_STARTING
          roundsLeft = nTotal;
          nCorrect = 0;
          Patches.inputs.setScalar("nCorrect", nCorrect);
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
          lastTimeReported = Infinity;
          break;
        }
        case states.ROUND_STARTED: {
          if (sRemaining < lastTimeReported) {
            // Diagnostics.log("time remaining: " + sRemaining);
            lastTimeReported = sRemaining;
          }
          if (t > roundStartTime + roundTimeLimit) {
            setState(states.ROUND_TIMEOUT);
            Patches.inputs.setString("sRemaining", "" + 0);
          } else {
            Patches.inputs.setString("sRemaining", "" + sRemaining);
          }
          break;
        }
        case states.ROUND_WIN: {
          // stop user interaction
          // report win
          // trigger new round with delay
          setState(states.ROUND_STARTING, 2000);
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
          if (nCorrect === nTotal) {
            gameOverText.text = `Wow! Great job!\nYou got them all!`;
          } else if (nCorrect === 0) {
            gameOverText.text = `Oops! You found none.\nBetter luck next time!`;
          } else {
            gameOverText.text = `You found ${nCorrect} out of ${nTotal}!\nThink you can get\na perfect score?`;
          }
          break;
        }
        case states.EXPLORE: {
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
    let selectedCountry = SELECTED_NONE_TEXT;
    let selectedFeature = null;
    const handleLatLonChange = throttle(function (event) {
      const lonVal = event.newValues["0"];
      const latVal = event.newValues["1"];
      if (state === states.ROUND_STARTED) {
        if (
          state === states.ROUND_STARTED &&
          d3.geoContains(countriesByName[targetCountry], [lonVal, latVal])
        ) {
          nCorrect++;
          Patches.inputs.setScalar("nCorrect", nCorrect);
          setState(states.ROUND_WIN);
        }
      }
      if (state === states.EXPLORE) {
        // TODO: consider a tree-based optimization or checking for rational distance first
        // TODO: also consider smoothing this signal, or only caring about changes greater than x
        if (selectedFeature) {
          if (d3.geoContains(selectedFeature, [lonVal, latVal])) {
            return;
          }
        }
        selectedCountry = SELECTED_NONE_TEXT;
        selectedFeature = null;
        countries110m.features.forEach((feature) => {
          if (d3.geoContains(feature, [lonVal, latVal])) {
            selectedFeature = feature;
            selectedCountry = feature.properties.name;
          }
        });
        selected = selectedCountry !== SELECTED_NONE_TEXT;
        exploreCountryText.text = selectedCountry;
        Patches.inputs.setBoolean("selected", selected);
        // Diagnostics.log(selectedCountry);
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
