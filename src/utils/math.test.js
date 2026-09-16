import { describe, it, expect } from "vitest";
import { evalDimensionExpr } from "./math.js";

describe("evalDimensionExpr", () => {
  it("zwykła liczba przechodzi bez zmian", () => {
    expect(evalDimensionExpr("600")).toBe(600);
    expect(evalDimensionExpr("18.5")).toBe(18.5);
    expect(evalDimensionExpr(600)).toBe(600);
  });

  it("liczy podstawowe działania", () => {
    expect(evalDimensionExpr("4+5")).toBe(9);
    expect(evalDimensionExpr("600-18")).toBe(582);
    expect(evalDimensionExpr("400+18*2")).toBe(436);
    expect(evalDimensionExpr("1200/2")).toBe(600);
  });

  it("obsługuje nawiasy, spacje i przecinek dziesiętny", () => {
    expect(evalDimensionExpr("(400+18)*2")).toBe(836);
    expect(evalDimensionExpr(" 4 + 5 ")).toBe(9);
    expect(evalDimensionExpr("18,5+1,5")).toBe(20);
  });

  it("puste pole to null", () => {
    expect(evalDimensionExpr("")).toBeNull();
    expect(evalDimensionExpr("   ")).toBeNull();
  });

  it("niepoprawne wyrażenie zwraca NaN, nie rzuca wyjątku", () => {
    expect(evalDimensionExpr("4+")).toBeNaN();
    expect(evalDimensionExpr("4++5")).not.toBeNaN(); // unarny plus - to poprawne wyrażenie
    expect(evalDimensionExpr("abc")).toBeNaN();
    expect(evalDimensionExpr("4/0")).toBeNaN();
    expect(evalDimensionExpr("<script>")).toBeNaN();
  });
});
