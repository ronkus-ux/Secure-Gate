/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 5 - HTTP security headers.
  //
  // These are response headers the browser reads before it does anything with
  // a page. Each one is a small default-on guard:
  //
  //   X-Content-Type-Options  - "don't guess the MIME type". Stops a browser
  //     interpreting an uploaded file (or a mangled response) as HTML and
  //     executing it, which is a stored-XSS vector.
  //
  //   Referrer-Policy         - how much of the previous URL we hand to the
  //     next site. "no-referrer" means a query string like ?email=... or
  //     ?callbackUrl=... does not leak to wherever the user navigates next.
  //
  //   X-Frame-Options         - "don't render this site in an <iframe>".
  //     Prevents clickjacking, where a malicious page frames our login form
  //     under invisible overlay elements and tricks the victim into clicking
  //     their "Press OK" button which is really our "Sign in" button.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;