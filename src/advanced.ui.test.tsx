// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import { STORAGE_KEY } from "./planner";
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear();
  window.location.hash = "#studySystem";
});
afterEach(cleanup);
it("adds a real permitted class, persists it and refuses duplicate entries", async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("ক্লাসের নাম"), {
    target: { value: "Physics seven hours" },
  });
  fireEvent.change(screen.getByLabelText("লিংক"), {
    target: { value: "https://example.org/lecture.mp4" },
  });
  fireEvent.change(screen.getByLabelText(/প্রকৃত duration/), {
    target: { value: "420" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /মালিক/ }));
  fireEvent.click(screen.getByRole("button", { name: "ক্লাস যোগ করো / বুকমার্ক" }));
  await screen.findByRole("heading", { name: "Physics seven hours" });
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).advanced.classes[0]
        .duration,
    ).toBe(25200),
  );
  expect(screen.getByRole("button", { name: "Save offline" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("ক্লাসের নাম"), {
    target: { value: "Duplicate" },
  });
  fireEvent.change(screen.getByLabelText("লিংক"), {
    target: { value: "https://example.org/lecture.mp4#same" },
  });
  fireEvent.change(screen.getByLabelText(/প্রকৃত duration/), {
    target: { value: "420" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ক্লাস যোগ করো / বুকমার্ক" }));
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).advanced.classes,
  ).toHaveLength(1);
});
it("does not offer platform downloads even when saved as a class bookmark", async () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText("ক্লাসের নাম"), {
    target: { value: "Public YouTube class" },
  });
  fireEvent.change(screen.getByLabelText("লিংক"), {
    target: { value: "https://youtube.com/watch?v=example" },
  });
  fireEvent.change(screen.getByLabelText(/প্রকৃত duration/), {
    target: { value: "60" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ক্লাস যোগ করো / বুকমার্ক" }));
  await screen.findByRole("heading", { name: "Public YouTube class" });
  expect(screen.queryByRole("button", { name: "Save offline" })).toBeNull();
});
