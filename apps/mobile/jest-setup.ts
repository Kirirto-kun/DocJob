// Global Jest setup for the mobile app. jest-expo's preset already wires up
// the React Native environment (mocked native modules, etc.); this file is
// the place for anything app-specific (e.g. RN Testing Library matchers are
// auto-extended by @testing-library/react-native v12.4+, so nothing to add
// there yet). Kept intentionally minimal for the SP-4b Task 1 scaffold —
// later tasks (auth/session, SecureStore, tRPC client) will likely add
// module mocks here as those land.
export {};
