import { fireEvent, render, screen } from "@testing-library/react";
import { Star } from "lucide-react";
import { describe, expect, it } from "vitest";
import EntityHeroImage from "@/components/detail/EntityHeroImage";

describe("EntityHeroImage", () => {
  it("shows the image in the entity's aspect and fit", () => {
    render(
      <EntityHeroImage
        src="/img/5.jpg"
        alt="Studio X"
        aspect="1/1"
        fit="contain"
        fallbackIcon={Star}
      />
    );

    const image = screen.getByRole("img", { name: "Studio X" });
    expect(image).toHaveAttribute("src", "/img/5.jpg");
    expect(image).toHaveStyle({ objectFit: "contain" });
    expect(image.parentElement).toHaveStyle({ aspectRatio: "1/1" });
  });

  it("shows the fallback icon without an image, or when it fails", () => {
    const { rerender } = render(
      <EntityHeroImage
        src={null}
        alt="Studio X"
        aspect="1/1"
        fit="contain"
        fallbackIcon={Star}
      />
    );
    expect(screen.queryByRole("img", { name: "Studio X" })).toBeNull();
    expect(screen.getByTestId("hero-fallback")).toBeInTheDocument();

    rerender(
      <EntityHeroImage
        src="/img/5.jpg"
        alt="Studio X"
        aspect="1/1"
        fit="contain"
        fallbackIcon={Star}
      />
    );
    fireEvent.error(screen.getByRole("img", { name: "Studio X" }));
    expect(screen.queryByRole("img", { name: "Studio X" })).toBeNull();
    expect(screen.getByTestId("hero-fallback")).toBeInTheDocument();
  });
});
