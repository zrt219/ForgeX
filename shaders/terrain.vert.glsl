uniform float uTime;
uniform float uPulse;

varying vec3 vWorldPosition;
varying vec3 vViewPosition;
varying float vElevation;
varying float vSlopeMask;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    total += noise(p) * amplitude;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return total;
}

void main() {
  vec3 transformed = position;
  float radial = length(transformed.xz * vec2(0.58, 0.82));
  float coneMask = smoothstep(22.0, 1.6, radial);
  float coneHeight = pow(max(coneMask, 0.0), 1.72) * 10.8;
  float largeNoise = fbm(transformed.xz * 0.1 + vec2(4.0, 9.0)) * 1.1;
  float ridgeNoise = fbm(transformed.xz * 0.26 + vec2(0.0, uTime * 0.01)) * 0.82;
  float foothills = fbm(transformed.xz * 0.06 + vec2(9.0, 2.0)) * 1.4;
  float pulse = uPulse * 0.12;

  transformed.y += coneHeight;
  transformed.y += largeNoise * coneMask;
  transformed.y += ridgeNoise * coneMask * 0.65;
  transformed.y += foothills * (1.0 - coneMask) * 0.6;
  transformed.y += sin(transformed.x * 0.09 + uTime * 0.08) * 0.03;
  transformed.y += pulse;

  vec2 sampleOffset = vec2(0.15, 0.0);
  float radialX = length((transformed.xz + sampleOffset.xy) * vec2(0.58, 0.82));
  float radialZ = length((transformed.xz + sampleOffset.yx) * vec2(0.58, 0.82));
  float slopeA = abs(radialX - radial);
  float slopeB = abs(radialZ - radial);

  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;

  vWorldPosition = worldPosition.xyz;
  vViewPosition = -viewPosition.xyz;
  vElevation = transformed.y;
  vSlopeMask = clamp((slopeA + slopeB) * 2.8, 0.0, 1.0);

  gl_Position = projectionMatrix * viewPosition;
}
