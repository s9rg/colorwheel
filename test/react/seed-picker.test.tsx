import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeedColorPicker } from "../../demo/src/SeedColorPicker";

function ControlledSeed() {
  const [value, setValue] = useState("#00cc00");
  return <SeedColorPicker value={value} onChange={setValue} />;
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /Open color picker/ }));
}

function changeChannel(name: string, value: string) {
  fireEvent.change(screen.getByRole("slider", { name }), { target: { value } });
}

describe("demo seed editing state", () => {
  it("recovers hue and saturation after brightness reaches black", () => {
    render(<ControlledSeed />);
    openPicker();
    changeChannel("Brightness", "0");
    expect(screen.getByRole("slider", { name: "Hue" })).toHaveValue("120");
    expect(screen.getByRole("slider", { name: "Saturation" })).toHaveValue("100");
    changeChannel("Brightness", "80");
    expect(screen.getByRole("button", { name: /Open color picker/ })).toHaveAccessibleName(
      "Seed color: #00CC00. Open color picker"
    );
  });

  it("retains a hue chosen at gray and does not erase it on an unchanged hex blur", () => {
    render(<ControlledSeed />);
    openPicker();
    changeChannel("Saturation", "0");
    changeChannel("Hue", "240");
    fireEvent.blur(screen.getByRole("textbox", { name: "Hex" }));
    changeChannel("Saturation", "100");
    expect(screen.getByRole("button", { name: /Open color picker/ })).toHaveAccessibleName(
      "Seed color: #0000CC. Open color picker"
    );
  });

  it("replaces retained channels when an external color changes and later returns", () => {
    const onChange = () => {};
    const view = render(<SeedColorPicker value="#000000" onChange={onChange} />);
    openPicker();
    changeChannel("Hue", "240");
    expect(screen.getByRole("slider", { name: "Hue" })).toHaveValue("240");
    view.rerender(<SeedColorPicker value="#00cc00" onChange={onChange} />);
    expect(screen.getByRole("slider", { name: "Hue" })).toHaveValue("120");
    view.rerender(<SeedColorPicker value="#000000" onChange={onChange} />);
    expect(screen.getByRole("slider", { name: "Hue" })).toHaveValue("0");
  });
});
