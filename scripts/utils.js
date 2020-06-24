const Reactive = require("Reactive");
const Time = require("Time");

/**
 * Convert texture coordinates to latitude and longitude
 * @param {Point2DSignal} uv texture coordinates
 * @returns {Object} object containing lat and lon properties
 */
export function uvToLatLon(uv) {
  const lon = uv.x.sub(0.5).mul(360);
  const lat = uv.y.sub(0.5).mul(-180);
  return { lon, lat };
}

/**
 * Convert model space point to texture space
 * assuming a spherical texture mapping
 * @param {PointSignal} p point in model space
 * @returns {Point2DSignal} point in texture space
 */
export function modelToTextureSpherical(p) {
  p = p.normalize();
  const px = p.x.mul(-1);
  const pz = p.z;
  let uvx = Reactive.atan2(pz, px)
    .add(Math.PI)
    .div(2 * Math.PI);
  const py = p.y;
  let uvy = Reactive.acos(py).div(Math.PI);
  const uv = Reactive.point2d(uvx, uvy);
  return uv;
}

/**
 * Convert world space point to model space
 * equivalent to using inverse model matrix.
 * Assumes matrices normally apply in SRT,
 * so inverse is TRS
 * @param {PointSignal} p point in world space
 * @param {Transform} transform object transform
 * @returns {VectorSignal} point in model space
 */
export function worldToModel(p, transform) {
  let model = p.sub(transform.position);
  model = matrixMul(
    eulerToRotationMatrix(0, 0, transform.rotationZ.mul(-1)),
    model
  );
  model = matrixMul(
    eulerToRotationMatrix(0, transform.rotationY.mul(-1), 0),
    model
  );
  model = matrixMul(
    eulerToRotationMatrix(transform.rotationX.mul(-1), 0, 0),
    model
  );
  // model = model.div(transform.scaleX);
  return Reactive.vector(
    model.x.div(transform.scaleX),
    model.y.div(transform.scaleY),
    model.z.div(transform.scaleZ)
  );
}

/**
 * Return forward vector for given transform
 * @param {Transform} transform
 * @returns {VectorSignal} forward vector
 */
export function transformToForward(transform) {
  return matrixMul(
    eulerToRotationMatrix(
      transform.rotationX,
      transform.rotationY,
      transform.rotationZ
    ),
    Reactive.vector(0, 0, -1)
  );
}

/**
 * Convert Euler angles to rotation matrix
 * @param {ScalarSignal} x Euler rotation X
 * @param {ScalarSignal} y Euler rotation Y
 * @param {ScalarSignal} z Euler rotation Z
 * @returns {Array<VectorSignal>} Rotation matrix as array of vectors
 */
export function eulerToRotationMatrix(x, y, z) {
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

  return [
    Reactive.vector(m00, m01, m02),
    Reactive.vector(m10, m11, m12),
    Reactive.vector(m20, m21, m22),
  ];
}

/**
 * Multiply matrix and vector
 * @param {Array<VectorSignal>} m matrix
 * @param {VectorSignal} v vector
 * @returns {VectorSignal} result vector
 */
export function matrixMul(m, v) {
  return Reactive.vector(m[0].dot(v), m[1].dot(v), m[2].dot(v));
}

/**
 * Multiply matrix and vector
 * @param {Array<VectorSignal>} m matrix
 * @param {VectorSignal} v vector
 * @returns {VectorSignal} result vector
 */
export function matrixTranspose(m) {
  return [
    Reactive.vector(m[0].x, m[1].x, m[2].x),
    Reactive.vector(m[0].y, m[1].y, m[2].y),
    Reactive.vector(m[0].z, m[1].z, m[2].z),
  ];
}

/**
 * Solve quadratic equation given a, b, and c
 * returning the lesser non-negative result
 * or 0 if none
 * @param {ScalarSignal} a
 * @param {ScalarSignal} b
 * @param {ScalarSignal} c
 * @return {ScalarSignal} result
 */
export function solveQuadratic(a, b, c) {
  const ac4 = a.mul(c).mul(4);
  const discr = b.pow(2).sub(ac4);

  const q = b
    .gt(0)
    .ifThenElse(discr.sqrt().add(b).mul(-0.5), b.sub(discr.sqrt()).mul(-0.5));

  const x0 = discr
    .lt(0)
    .ifThenElse(0, discr.eq(0).ifThenElse(b.mul(-0.5).div(a), q.div(a)));

  const x1 = discr
    .lt(0)
    .ifThenElse(0, discr.eq(0).ifThenElse(b.mul(-0.5).div(a), c.div(q)));

  return Reactive.and(x0.lt(0), x1.lt(0)).ifThenElse(
    0,
    x1
      .lt(0)
      .ifThenElse(x0, x0.lt(0).ifThenElse(x1, x0.lt(x1).ifThenElse(x0, x1)))
  );
}

/**
 * Find intersection distance between ray and a sphere
 * @param {PointSignal} center center of the sphere
 * @param {ScalarSignal} radius radius of the sphere
 * @param {PointSignal} origin origin of ray
 * @param {VectorSignal} direction distance from origin to sphere surface
 * @returns {ScalarSignal} distance between ray and sphere
 */
export function intersect(center, radius, origin, direction) {
  const radius2 = radius.pow(2);
  const L = origin.sub(center);
  const a = direction.dot(direction);
  const b = direction.dot(L).mul(2);
  const c = L.dot(L).sub(radius2);
  return solveQuadratic(a, b, c);
}

/**
 * Find point at intersection between ray and a sphere
 * @param {PointSignal} center center of the sphere
 * @param {ScalarSignal} radius radius of the sphere
 * @param {PointSignal} origin origin of ray
 * @param {VectorSignal} direction direction of ray
 * @returns {PointSignal} point at intersection between ray and sphere
 */
export function raycastToSphere(center, radius, origin, direction) {
  const t = intersect(center, radius, origin, direction);
  let p = origin.add(direction.mul(t));
  return p;
}

/**
 * Returns a function, that, when invoked, will only be triggered at most once
 * during a given window of time. Normally, the throttled function will run
 * as much as it can, without ever going more than once per `wait` duration;
 * but if you'd like to disable the execution on the leading edge, pass
 * `{leading: false}`. To disable execution on the trailing edge, ditto.
 * [From Underscore.js]
 * @param {Function} func function to throttle
 * @param {Number} wait duration in milliseconds
 * @param {Object} [options]
 * @param {Boolean} [options.leading]
 * @param {Boolean} [options.trailing]
 * @returns {Function} throttled function
 */
export function throttle(func, wait, options) {
  var context, args, result;
  var timeout = null;
  var previous = 0;
  if (!options) options = {};
  var later = function () {
    previous = options.leading === false ? 0 : Date.now();
    timeout = null;
    result = func.apply(context, args);
    if (!timeout) context = args = null;
  };
  return function () {
    var now = Date.now();
    if (!previous && options.leading === false) previous = now;
    var remaining = wait - (now - previous);
    context = this;
    args = arguments;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        Time.clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    } else if (!timeout && options.trailing !== false) {
      timeout = Time.setTimeout(later, remaining);
    }
    return result;
  };
}
