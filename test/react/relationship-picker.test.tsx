import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaletteRelationshipPicker } from "../../demo/src/PaletteRelationshipPicker";
import type { PaletteMode } from "../../demo/src/palette-relationships";

function Example() {
  const [value, setValue] = useState<PaletteMode>("complementary");
  return (
    <>
      <PaletteRelationshipPicker value={value} onChange={setValue} />
      <input aria-label="Next color" defaultValue="#00c4cc" />
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("Palette relationship focus restoration", () => {
  it("does not reclaim focus after the user moves to another field", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    render(<Example />);
    const relationship = screen.getByRole("combobox", { name: "Palette relationship" });
    fireEvent.click(relationship);
    const option = screen.getByRole("option", { name: /^Analogous/ });
    option.focus();
    fireEvent.click(option);
    expect(relationship).toHaveTextContent("Analogous");
    const input = screen.getByRole("textbox", { name: "Next color" });
    input.focus();
    act(() => callbacks.forEach((callback) => callback(0)));
    expect(input).toHaveFocus();
  });

  it("returns focus to the trigger when the selected option disappears", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    render(<Example />);
    const relationship = screen.getByRole("combobox", { name: "Palette relationship" });
    fireEvent.click(relationship);
    const option = screen.getByRole("option", { name: /^Analogous/ });
    option.focus();
    fireEvent.click(option);
    act(() => callbacks.forEach((callback) => callback(0)));
    expect(relationship).toHaveFocus();
  });
});
