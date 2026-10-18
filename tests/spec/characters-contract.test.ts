// Data contract for src/data/characters.json, the lore and scope file.
//
// characters.json is the brief: it names the six beings, their Milestone 1 scope
// and what is explicitly out of scope. It is shared, so a human or an agent can
// extend it, but the shape has to stay usable by tests and by the sim.

import { describe, expect, it } from "vitest";

import { characters, manifest } from "./helpers";

const roster = characters.characters;
const ids = roster.map((entry) => entry.id);

describe("characters.json shape", () => {
  it("declares only the supported schema version", () => {
    expect(characters.schemaVersion).toBe(1);
  });

  it("names the six beings exactly once each", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["capybara", "orca", "shark", "tarantula", "snail", "human"]);
  });

  it("agrees with the roster the manifest can actually draw", () => {
    expect(Object.keys(manifest.characters).sort()).toEqual([...ids].sort());
  });

  it("makes exactly one character playable", () => {
    const playable = roster.filter((entry) => entry.playable);
    expect(playable.map((entry) => entry.id)).toEqual(["capybara"]);
  });

  it("gives every character a display name, a title and a species", () => {
    for (const entry of roster) {
      expect(entry.displayName, entry.id).not.toBe("");
      expect(entry.title, entry.id).not.toBe("");
      expect(entry.species, entry.id).not.toBe("");
      expect(entry.faction, entry.id).not.toBe("");
      expect(entry.lore.length, entry.id).toBeGreaterThan(10);
      expect(entry.personality.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("gives every character a Milestone 1 must list with nothing vague in it", () => {
    for (const entry of roster) {
      expect(entry.milestone1.must.length, entry.id).toBeGreaterThan(0);
      expect(entry.milestone1.mustNot.length, entry.id).toBeGreaterThan(0);
      for (const rule of [...entry.milestone1.must, ...entry.milestone1.may, ...entry.milestone1.mustNot]) {
        expect(rule, entry.id).toMatch(/\.$/);
        expect(rule.length, `${entry.id}: ${rule}`).toBeGreaterThan(15);
      }
    }
  });

  it("never asks for the same thing in must and mustNot", () => {
    for (const entry of roster) {
      const mustNot = new Set(entry.milestone1.mustNot);
      for (const rule of entry.milestone1.must) {
        expect(mustNot.has(rule), `${entry.id}: ${rule}`).toBe(false);
      }
    }
  });

  it("lists only sprite ids the manifest can sample", () => {
    const spriteIds = manifest.sprites.map((sprite) => sprite.id);
    for (const entry of roster) {
      expect(entry.spriteIds.length, entry.id).toBeGreaterThan(0);
      for (const spriteId of entry.spriteIds) {
        expect(spriteIds, `${entry.id} -> ${spriteId}`).toContain(spriteId);
      }
    }
  });

  it("counts every character at least once, and only the humans as a range", () => {
    for (const entry of roster) {
      const count = entry.spawn.count;
      if (typeof count === "number") {
        expect(count, entry.id).toBe(1);
        continue;
      }
      expect(entry.id).toBe("human");
      expect(count.min).toBeGreaterThan(0);
      expect(count.min).toBeLessThanOrEqual(count.max);
    }
  });

  it("describes the world the arena actually renders", () => {
    expect(characters.world.arenaBackground).toBe(manifest.arena.background);
    expect(characters.milestone1.name).not.toBe("");
    expect(characters.milestone1.spawn.rule).toMatch(/seeded/i);
    expect(characters.milestone1.spawn.seedDefault).toBe(
      manifest.arena.spawn.seedDefault,
    );
  });
});