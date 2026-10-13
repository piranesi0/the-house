// Built-in fog measured like the stone (final review I1). Browser-only: imported first by main.js,
// before any material compiles; gallery.js has no fog and does not import it.
//
// three r170's fog_vertex sets vFogDepth = -mvPosition.z, the view depth, so in look=lines a 40 m
// vault fogs out whenever you look up at it. Here the lines, the water grid, the birds and the old
// clouds measure as fogAmount in material.js does: the view-space offset turned to world
// orientation by the view rotation alone (a row-vector product is the transpose of viewMatrix), then
// the horizontal distance plus a third of the vertical. fog_fragment is untouched, so THREE.Fog's
// near and far keep their meaning (smoothstep from near to far over this measure).
import * as THREE from 'three';

THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vec3 fogOff = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
	vFogDepth = length( fogOff.xz ) + abs( fogOff.y ) / 3.0;
#endif`;
