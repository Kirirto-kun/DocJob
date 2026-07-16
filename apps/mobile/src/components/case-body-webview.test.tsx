import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { CaseBodyWebView, wrapCaseBodyHtml } from './case-body-webview';
import { API_BASE_URL } from '../lib/config';

/**
 * `react-native-webview` mocked the same way `app/case/[id].test.tsx` does:
 * a plain `View` that surfaces `source.html` via `accessibilityLabel` so the
 * generated HTML string can be asserted on without a real native WebView.
 */
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    WebView: (props: { testID?: string; source?: { html?: string } }) =>
      React.createElement(View, {
        testID: props.testID,
        accessibilityLabel: props.source?.html,
      }),
  };
});

describe('wrapCaseBodyHtml', () => {
  it('injects a <base href> pointing at API_BASE_URL so relative /api/... image srcs resolve', () => {
    const html = wrapCaseBodyHtml('<p>hello</p>');
    expect(html).toContain(`<base href="${API_BASE_URL}/" />`);
    // The <base> tag must live in <head>, before the body content.
    expect(html.indexOf('<base href=')).toBeLessThan(html.indexOf('<body>'));
  });
});

describe('CaseBodyWebView', () => {
  it('renders a webview whose source html contains the <base href> fix', async () => {
    await render(<CaseBodyWebView html="<p>Кейс</p>" />);
    const webview = screen.getByTestId('case-body-webview');
    expect(webview.props.accessibilityLabel).toContain(`<base href="${API_BASE_URL}/" />`);
    expect(webview.props.accessibilityLabel).toContain('<p>Кейс</p>');
  });
});
