// SPDX-License-Identifier: MS-PL

/**
 * What a particle system must answer, shared by the windowed and browser suites.
 *
 * The scenario is one both backends run identically: particles simulated on the CPU with every
 * source of variance turned off and no speed at all, so every particle in a system sits exactly on
 * its emitter and each system paints one square, at the point the camera puts that emitter, as
 * wide as its particle size. Two emitters at different places and different sizes, one camera
 * move, and one system with nothing alive.
 *
 * The expectations are the *camera's*, not CNA's: the view and the projection are built here from
 * `CreateLookAt` and `CreateOrthographic`, and the emitter positions and particle sizes are chosen
 * here. What CNA supplies is the picture. So a draw that ignored the view, the projection, the
 * emitter position or the particle size lands somewhere this cannot follow it.
 *
 * Soft particles are upstream finding 12 and are asserted *as they behave* rather than skipped --
 * the depth input and the softness reach CNA, store, read back, and change no texel. That
 * assertion fails the day the fade starts working, which is the point of making it.
 *
 * Shared because two copies of a claim about one piece of CNA is how two suites come to disagree
 * about whether it has been repaired.
 */

import assert from "node:assert/strict";

/** Asserts the whole particle scenario, in the shape both suites record it in. */
export function assertParticleEvidence(particles) {
  assert.equal(
    particles.evidenceError ?? null, null,
    `the engine layer was present and the particle scenario failed: ${particles.evidenceStack ?? ""}`,
  );
  // CNA's own default capacity, through the route that does not take one. The number is not
  // written here twice: tools/cna-abi/contract.json compiles a _Static_assert that
  // CNA_PARTICLE_SYSTEM_DEFAULT_CAPACITY is 1024 against CNA's headers.
  assert.equal(particles.defaultCapacity, 1024);
  // The binding point a particle vertex shader reads the pool at, agreeing with the GLSL CNA hands
  // out for exactly that purpose -- a macro and a shader string, from two different routes.
  assert.equal(particles.bindingPoint, 7);
  assert.match(
    particles.glsl, new RegExp(`binding\\s*=\\s*${particles.bindingPoint}\\b`),
    "CNA's particle GLSL declares the binding point the API states",
  );
  assert.match(particles.glsl, /std430/, "and it is the storage-buffer layout the simulation uses");

  // Softness is floored rather than refused, which is CNA's documented choice.
  assert.equal(particles.softness.before, 0);
  assert.equal(particles.softness.set, 2.5, "a softness round-trips");
  assert.equal(particles.softness.floored, 0, "and a negative one reads back as zero");

  // The scene, before anything is drawn: the settings CNA holds are the ones that were set, and
  // every particle is standing exactly on the emitter, which is what makes the draw predictable.
  assert.deepEqual(particles.settings.position, particles.near.position);
  assert.deepEqual(
    [particles.settings.speed, particles.settings.coneAngle], [0, 0],
    "no speed and no cone: every particle stays where it was born",
  );
  assert.deepEqual(
    particles.nearPositions, [particles.near.position.join(",")],
    "all 32 particles are on the emitter, and none anywhere else",
  );
  /*
   * What one frame of simulation did.
   *
   * A system whose pool `Reset` fills draws the same picture whether or not `Update` ever ran, so
   * neither the counts nor any texel below can tell that the elapsed time reached CNA. The
   * particles' own age is the only thing that can: after two quarter-second updates every live
   * particle is half a second older than `Reset` left it. A planted `Update` that dropped its
   * elapsed time survived everything else in this file until this was added.
   */
  const ageing = particles.ageing;
  assert.ok(ageing.afterOneUpdate.length > 0, "the ageing probe has particles to age");
  for (let index = 0; index < ageing.afterOneUpdate.length; index += 1) {
    const first = ageing.afterOneUpdate[index] - (ageing.afterReset[index] ?? 0);
    const second = ageing.afterTwoUpdates[index] - ageing.afterOneUpdate[index];
    assert.ok(
      Math.abs(first - 0.25) < 1e-4 && Math.abs(second - 0.25) < 1e-4,
      `particle ${index} aged by ${first} and then ${second}; each update was 0.25 seconds`,
    );
  }

  assert.equal(particles.counts.near, 32);
  assert.equal(particles.counts.far, 32);
  assert.equal(particles.counts.idle, 0, "an emission rate of zero brings nothing to life");

  /*
   * The oracle: where the camera puts a world point, and how big a world-space size is there.
   *
   * The view and the projection are the test's own -- built from XNA's CreateLookAt and
   * CreateOrthographic -- and the emitter positions and particle sizes are the test's too. What
   * CNA supplies is the picture. So a draw that ignored the view, ignored the projection, ignored
   * the emitter position, or ignored the particle size lands somewhere this cannot follow it.
   */
  const project = (view, projection, point) => {
    const through = (m, [x, y, z, w]) => [0, 1, 2, 3].map((column) =>
      m[column] * x + m[4 + column] * y + m[8 + column] * z + m[12 + column] * w);
    const clip = through(projection, through(view, [...point, 1]));
    return { X: clip[0] / clip[3], Y: clip[1] / clip[3] };
  };
  const expectBlob = (label, blob, view, emitter) => {
    const ndc = project(view, particles.projection, emitter.position);
    const centreX = (ndc.X * 0.5 + 0.5) * particles.size;
    const centreY = (0.5 - ndc.Y * 0.5) * particles.size;
    // A particle is a square that many world units across, and the orthographic width says how
    // many texels a world unit is worth.
    const worldPerNdc = particles.projection[0];
    const halfWidth = (emitter.Size * 0.5) * worldPerNdc * 0.5 * particles.size;
    assert.ok(halfWidth > 2, "the particle must be big enough for its extent to mean something");
    for (const [name, got, want] of [
      ["minX", blob.minX, centreX - halfWidth], ["maxX", blob.maxX, centreX + halfWidth],
      ["minY", blob.minY, centreY - halfWidth], ["maxY", blob.maxY, centreY + halfWidth],
    ]) {
      assert.ok(
        Math.abs(got - want) <= 1.5,
        `${label} ${name}: painted ${got}, the camera predicts ${want.toFixed(2)}`,
      );
    }
    // Solid, not an outline, and painted in the particle texture's colour alone.
    const area = 4 * halfWidth * halfWidth;
    assert.ok(
      Math.abs(blob.count - area) / area < 0.2,
      `${label} covers ${blob.count} texels; the predicted square is ${area.toFixed(0)}`,
    );
    assert.deepEqual(
      blob.colours, [particles.particleColor],
      `${label} is painted in the particle texture's colour and nothing else`,
    );
  };

  assert.equal(particles.straightOn.blobs.length, 2, "two emitters paint two separate regions");
  const [farBlob, nearBlob] = particles.straightOn.blobs;
  expectBlob("the far emitter", farBlob, particles.straightOn.view, particles.far);
  expectBlob("the near emitter", nearBlob, particles.straightOn.view, particles.near);
  // Different sizes, not one square drawn twice.
  assert.ok(
    farBlob.count > nearBlob.count * 2,
    "a particle twice as wide covers about four times the area",
  );

  // Each system's blob is its own.
  assert.equal(particles.nearOnly.length, 1);
  assert.equal(particles.farOnly.length, 1);
  assert.deepEqual(
    [particles.nearOnly[0].minX, particles.nearOnly[0].minY], [nearBlob.minX, nearBlob.minY],
    "drawing one system alone puts its square exactly where drawing both did",
  );
  assert.deepEqual(
    [particles.farOnly[0].minX, particles.farOnly[0].minY], [farBlob.minX, farBlob.minY],
  );

  // A system with nothing alive draws nothing and does not fail -- CNA says so, and it does.
  assert.deepEqual(particles.idleOnly, [], "an empty system paints no texel at all");

  // Move the camera, and both squares move by what the new view predicts.
  assert.equal(particles.shifted.blobs.length, 2);
  expectBlob("the shifted far emitter", particles.shifted.blobs[0], particles.shifted.view, particles.far);
  expectBlob("the shifted near emitter", particles.shifted.blobs[1], particles.shifted.view, particles.near);
  // And it really moved: a view the draw ignored would leave them where they were.
  const movedBy = particles.straightOn.blobs[0].minX - particles.shifted.blobs[0].minX;
  assert.ok(
    movedBy > 8,
    `a ${particles.shifted.shift}-unit camera move must shift the picture, not leave it (moved ${movedBy})`,
  );

  /*
   * Soft particles: `docs/upstream-cna-findings.md` item 12.
   *
   * The softness is set and reads back, the depth image says every pixel is at the camera, and the
   * particle is drawn exactly as it was with no depth input at all. When CNA repairs the fade this
   * fails, which is the point of asserting it.
   */
  const fade = particles.fade;
  assert.equal(fade.softness, 50, "the softness CNA holds is the one that was set");
  assert.equal(fade.withoutDepth.length, 1, "the system draws one square to begin with");
  if (fade.usesCompute) {
    // The GPU draw path really is the one running: it paints a different number of texels than the
    // CPU billboard path does for the same particle. So a fade that does nothing is a fade that
    // does nothing, not a quiet fallback to the path that never had one.
    assert.notEqual(
      fade.withoutDepth[0].count, fade.cpu[0].count,
      "the GPU and CPU draw paths must be distinguishable for this measurement to mean anything",
    );
    assert.deepEqual(
      fade.withNearDepth, fade.withoutDepth,
      "UPSTREAM FINDING 12 REPAIRED: a depth image of zeros now changes the drawn particle. " +
      "Update docs/upstream-cna-findings.md and assert the fade properly.",
    );
    assert.deepEqual(
      fade.afterClearing, fade.withoutDepth, "and clearing the depth input changes nothing either",
    );
  }

  // What the typed surface refuses before CNA ever sees it.
  assert.equal(particles.refusals.nullTexture, "TypeError");
  assert.equal(particles.refusals.disposedTexture, "ObjectDisposedException");
  assert.equal(particles.refusals.disposedSystem, "NativeUnavailableError");
}

/**
 * CNA's own simulation, integrated forward twice and compared with itself.
 *
 * `cna_particle_system_random` is the generator every spawn draws from and
 * `cna_particle_system_step` advances one particle by one frame, both pure and both reached by a
 * different route from the system that uses them. So a trajectory can be integrated here through
 * CNA's own step and compared, component by component, with where CNA's own system put its
 * particles after the same number of updates of the same length.
 *
 * That is a stronger statement than "the particles moved": it says the binding's marshalling of
 * `CNA_Particle` and `CNA_ParticleEmitterSettings` -- three `CNA_Vector4`s and fourteen fields
 * across two growable structures -- agrees with what CNA reads out of the same memory.
 */
export function assertParticleSimulationOracle(simulation) {
  // The generator: a unit fraction for every seed, and different seeds giving different numbers.
  for (const [seed, value] of simulation.random) {
    assert.ok(
      value >= 0 && value <= 1,
      `cna_particle_system_random(${seed}) answered ${value}, which is not a unit fraction`,
    );
  }
  assert.equal(
    new Set(simulation.random.map(([, value]) => value)).size, simulation.random.length,
    "distinct seeds must give distinct numbers, or the seed is not reaching CNA",
  );

  /*
   * The default particle, against the sentence its own header writes: "a particle at the origin,
   * at rest, aged zero with a lifetime of one". The state vector is age, lifetime, spawn seed and
   * respawn count, so that sentence is `[0, 1, 0, 0]` and not four zeros -- which is what this
   * assertion said first, and what the measurement corrected.
   *
   * It is also the assertion that catches a binding reading only two of the three vectors: with
   * all three zeroed there would be nothing to notice, and the lifetime of one is the one non-zero
   * component in the whole structure.
   */
  assert.deepEqual(
    simulation.defaultParticle,
    { Position: [0, 0, 0, 0], Velocity: [0, 0, 0, 0], State: [0, 1, 0, 0] },
    "CNA initialises a particle at the origin, at rest, aged zero with a lifetime of one",
  );

  /*
   * The trajectory. Gravity only, no drag, no speed: after `n` steps of `dt` a particle launched
   * from rest has fallen `g * (dt^2) * n(n+1)/2` if the integrator is semi-implicit Euler, and
   * `g * (dt^2) * n(n-1)/2` if it is explicit. Which of the two CNA uses is not assumed -- the
   * comparison below is against CNA's own `step`, run here -- but the closed form is asserted too,
   * because a `step` that did nothing would agree with a JavaScript loop that also called it.
   */
  const { integrated, gravity, elapsed, steps } = simulation.trajectory;
  assert.equal(integrated.length, steps + 1, "one recorded state per step, plus the start");
  const fell = integrated[0].Position[1] - integrated[steps].Position[1];
  const semiImplicit = gravity * elapsed * elapsed * (steps * (steps + 1)) / 2;
  const explicit = gravity * elapsed * elapsed * (steps * (steps - 1)) / 2;
  assert.ok(
    Math.abs(fell - semiImplicit) < 1e-3 || Math.abs(fell - explicit) < 1e-3,
    `after ${steps} steps of ${elapsed}s under ${gravity} the particle fell ${fell}, which is ` +
    `neither the semi-implicit ${semiImplicit} nor the explicit ${explicit} closed form`,
  );
  assert.ok(fell > 0, "a particle under gravity must actually fall");
  // Neither axis it was not pushed along moves at all, which is what says gravity reached the
  // component it was written into rather than all three.
  assert.equal(integrated[steps].Position[0], integrated[0].Position[0], "nothing moves it across");
  assert.equal(integrated[steps].Position[2], integrated[0].Position[2], "or in depth");
  // Velocity accumulates linearly, whichever integrator it is.
  assert.ok(
    Math.abs(integrated[steps].Velocity[1] - -gravity * elapsed * steps) < 1e-3,
    `the velocity after ${steps} steps is ${integrated[steps].Velocity[1]}, not ` +
    `${-gravity * elapsed * steps}`,
  );
  // And the age in the state vector advances by exactly one step each time.
  for (let index = 1; index <= steps; index += 1) {
    assert.ok(
      Math.abs((integrated[index].State[0] - integrated[index - 1].State[0]) - elapsed) < 1e-4,
      `the particle's age advances by ${elapsed} per step, and step ${index} advanced it by ` +
      `${integrated[index].State[0] - integrated[index - 1].State[0]}`,
    );
  }

  /*
   * And the same emitter settings through CNA and back.
   *
   * `CNA_ParticleEmitterSettings` is a growable structure whose `struct_size` selects which fields
   * CNA reads, and it carries fourteen members across three `CNA_Vector3`s, two `CNA_Vector4`s and
   * nine floats. Every one of them is written with a distinct value, so a field read at a
   * neighbour's offset comes back as a number that belongs to something else.
   */
  const written = simulation.settingsRoundTrip.written;
  const read = simulation.settingsRoundTrip.read;
  assert.deepEqual(read, written, "every emitter field round-trips through CNA's own structure");
  const scalars = Object.values(written).filter((value) => typeof value === "number");
  assert.equal(
    new Set(scalars).size, scalars.length,
    "the scalar fields are all distinct, so a field read at the wrong offset is visible",
  );
}
