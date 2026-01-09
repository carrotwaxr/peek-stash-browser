/**
 * Pagination Component Tests
 *
 * Tests user interactions with pagination controls:
 * - Navigation between pages
 * - Per-page selection
 * - Boundary conditions (first/last page)
 * - Record count display
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Pagination from "../../../src/components/ui/Pagination.jsx";

// Mock TV mode hook
vi.mock("../../../src/hooks/useTVMode.js", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

// Mock horizontal navigation hook
vi.mock("../../../src/hooks/useHorizontalNavigation.js", () => ({
  useHorizontalNavigation: () => ({
    setItemRef: () => {},
    isFocused: () => false,
  }),
}));

describe("Pagination", () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    onPageChange: vi.fn(),
    perPage: 24,
    onPerPageChange: vi.fn(),
    totalCount: 240,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders navigation buttons", () => {
      render(<Pagination {...defaultProps} />);

      expect(screen.getByLabelText("First Page")).toBeInTheDocument();
      expect(screen.getByLabelText("Previous Page")).toBeInTheDocument();
      expect(screen.getByLabelText("Next Page")).toBeInTheDocument();
      expect(screen.getByLabelText("Last Page")).toBeInTheDocument();
    });

    it("renders page dropdown with correct value", () => {
      render(<Pagination {...defaultProps} currentPage={5} />);

      // Find the page selector dropdown
      const pageSelect = screen.getByRole("combobox", { name: "" });
      // It should show "5 of 10" as selected
      expect(pageSelect).toHaveValue("5");
    });

    it("renders per-page selector when onPerPageChange provided", () => {
      render(<Pagination {...defaultProps} />);

      expect(screen.getByLabelText("Per Page:")).toBeInTheDocument();
    });

    it("does not render per-page selector when showPerPageSelector is false", () => {
      render(<Pagination {...defaultProps} showPerPageSelector={false} />);

      expect(screen.queryByLabelText("Per Page:")).not.toBeInTheDocument();
    });

    it("shows record info when showInfo is true", () => {
      render(<Pagination {...defaultProps} currentPage={1} perPage={24} totalCount={240} />);

      expect(screen.getByText(/Showing 1-24 of 240/)).toBeInTheDocument();
    });

    it("calculates correct record range for middle pages", () => {
      render(<Pagination {...defaultProps} currentPage={5} perPage={24} totalCount={240} />);

      // Page 5: records 97-120
      expect(screen.getByText(/Showing 97-120 of 240/)).toBeInTheDocument();
    });

    it("shows correct range on last page with partial results", () => {
      render(<Pagination {...defaultProps} currentPage={10} perPage={24} totalCount={230} />);

      // Page 10: records 217-230 (not 217-240)
      expect(screen.getByText(/Showing 217-230 of 230/)).toBeInTheDocument();
    });

    it("does not render when totalPages is 0", () => {
      const { container } = render(<Pagination {...defaultProps} totalPages={0} />);

      expect(container.firstChild).toBeNull();
    });

    it("does not render when totalPages is undefined", () => {
      const { container } = render(
        <Pagination {...defaultProps} totalPages={undefined} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Navigation Buttons", () => {
    it("calls onPageChange with page 1 when First button clicked", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} />);

      await user.click(screen.getByLabelText("First Page"));

      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("calls onPageChange with previous page when Previous button clicked", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} />);

      await user.click(screen.getByLabelText("Previous Page"));

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it("calls onPageChange with next page when Next button clicked", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} />);

      await user.click(screen.getByLabelText("Next Page"));

      expect(onPageChange).toHaveBeenCalledWith(6);
    });

    it("calls onPageChange with last page when Last button clicked", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(
        <Pagination {...defaultProps} currentPage={5} totalPages={10} onPageChange={onPageChange} />
      );

      await user.click(screen.getByLabelText("Last Page"));

      expect(onPageChange).toHaveBeenCalledWith(10);
    });
  });

  describe("Button Disabled States", () => {
    it("disables First and Previous buttons on first page", () => {
      render(<Pagination {...defaultProps} currentPage={1} />);

      expect(screen.getByLabelText("First Page")).toBeDisabled();
      expect(screen.getByLabelText("Previous Page")).toBeDisabled();
      expect(screen.getByLabelText("Next Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Last Page")).not.toBeDisabled();
    });

    it("disables Next and Last buttons on last page", () => {
      render(<Pagination {...defaultProps} currentPage={10} totalPages={10} />);

      expect(screen.getByLabelText("First Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Previous Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Next Page")).toBeDisabled();
      expect(screen.getByLabelText("Last Page")).toBeDisabled();
    });

    it("enables all buttons on middle page", () => {
      render(<Pagination {...defaultProps} currentPage={5} totalPages={10} />);

      expect(screen.getByLabelText("First Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Previous Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Next Page")).not.toBeDisabled();
      expect(screen.getByLabelText("Last Page")).not.toBeDisabled();
    });

    it("disables all navigation buttons when only one page", () => {
      render(<Pagination {...defaultProps} currentPage={1} totalPages={1} />);

      expect(screen.getByLabelText("First Page")).toBeDisabled();
      expect(screen.getByLabelText("Previous Page")).toBeDisabled();
      expect(screen.getByLabelText("Next Page")).toBeDisabled();
      expect(screen.getByLabelText("Last Page")).toBeDisabled();
    });
  });

  describe("Page Dropdown", () => {
    it("calls onPageChange when page selected from dropdown", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      render(<Pagination {...defaultProps} currentPage={1} onPageChange={onPageChange} />);

      // Find dropdown and select page 5
      const comboboxes = screen.getAllByRole("combobox");
      const pageSelect = comboboxes[0]; // First combobox is page selector
      await user.selectOptions(pageSelect, "5");

      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it("shows all page options", () => {
      render(<Pagination {...defaultProps} totalPages={5} />);

      const comboboxes = screen.getAllByRole("combobox");
      const pageSelect = comboboxes[0];
      const options = Array.from(pageSelect.options);

      expect(options).toHaveLength(5);
      expect(options[0]).toHaveValue("1");
      expect(options[4]).toHaveValue("5");
    });
  });

  describe("Per-Page Selector", () => {
    it("calls onPerPageChange when per-page value changed", async () => {
      const user = userEvent.setup();
      const onPerPageChange = vi.fn();
      render(<Pagination {...defaultProps} perPage={24} onPerPageChange={onPerPageChange} />);

      const perPageSelect = screen.getByLabelText("Per Page:");
      await user.selectOptions(perPageSelect, "48");

      expect(onPerPageChange).toHaveBeenCalledWith(48);
    });

    it("displays correct per-page options", () => {
      render(<Pagination {...defaultProps} />);

      const perPageSelect = screen.getByLabelText("Per Page:");
      const options = Array.from(perPageSelect.options).map((opt) => opt.value);

      expect(options).toContain("12");
      expect(options).toContain("24");
      expect(options).toContain("48");
      expect(options).toContain("120");
    });

    it("shows current per-page value as selected", () => {
      render(<Pagination {...defaultProps} perPage={48} />);

      const perPageSelect = screen.getByLabelText("Per Page:");
      expect(perPageSelect).toHaveValue("48");
    });
  });

  describe("Edge Cases", () => {
    it("handles single-page result set", () => {
      render(
        <Pagination
          {...defaultProps}
          currentPage={1}
          totalPages={1}
          totalCount={15}
          perPage={24}
        />
      );

      expect(screen.getByText(/Showing 1-15 of 15/)).toBeInTheDocument();
    });

    it("handles exactly-full last page", () => {
      render(
        <Pagination
          {...defaultProps}
          currentPage={10}
          totalPages={10}
          totalCount={240}
          perPage={24}
        />
      );

      // Page 10: records 217-240 (exactly full)
      expect(screen.getByText(/Showing 217-240 of 240/)).toBeInTheDocument();
    });

    it("handles empty result set gracefully", () => {
      render(
        <Pagination
          {...defaultProps}
          currentPage={1}
          totalPages={0}
          totalCount={0}
        />
      );

      // Should not render when no pages
      expect(screen.queryByLabelText("Next Page")).not.toBeInTheDocument();
    });

    it("does not call onPageChange when undefined", async () => {
      const user = userEvent.setup();
      // Should not throw when onPageChange is undefined
      render(<Pagination {...defaultProps} onPageChange={undefined} currentPage={5} />);

      // Click should not throw
      await user.click(screen.getByLabelText("Next Page"));
    });
  });
});
