// Built-in fog measured like the stone (final review I1). Browser-only: imported first by main.js,
// before any material compiles; gallery.js has no fog and does not import it.
//
// three r170's fog_vertex sets vFogDepth = -mvPosition.z, the view depth, so in look=lines a 40 m
// vault fogs out whenever you look up at it. Here the lines, the water grid, the birds and the old
// clouds measure as fogAmount in material.js does: the view-space offset turned to world
// orientation by the view rotation alone (a row-vector product is the transpose of viewMatrix), then
// the horizontal distance plus a third of the vertical. THREE.Fog's near and far keep their meaning
// (smoothstep from near to far over this measure).
//
// The fog target follows the surfaces (final review S2 I1): above the horizon it turns from
// fogColor to the dome's sky along the same world-oriented ray (skyFogTarget, skydome.js), so a
// fully fogged line dissolves into the sky behind it. Built-in materials only see uniforms they are
// handed, so every LineBasicMaterial (hall lines, water grid, birds, old clouds) gets the shared sky
// uniforms in onBeforeCompile; SKY_FOG.uSkyFog gates it, 0 (plain fogColor) until main.js turns it
// on for the shaded look. look=lines has no dome and keeps the plain fog colour.
import * as THREE from 'three';
import { SKY_GLSL, SKY_UNIFORMS } from './skydome.js';

export const SKY_FOG = { uSkyFog: { value: 0 } };

THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogOff;
#endif`;

THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vec3 fogOff = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
	vFogDepth = length( fogOff.xz ) + abs( fogOff.y ) / 3.0;
	vFogOff = fogOff;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogOff;
	uniform float uSkyFog;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${SKY_GLSL}
#endif`;

THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 fogTarget = uSkyFog > 0.5 ? skyFogTarget( fogColor, vFogOff, fogFactor ) : fogColor;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTarget, fogFactor );
#endif`;

// Shared by reference, never cloned, so the dome's per-frame update reaches every line.
THREE.LineBasicMaterial.prototype.onBeforeCompile = function (shader) {
  Object.assign(shader.uniforms, SKY_UNIFORMS, SKY_FOG);
};
