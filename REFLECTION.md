# SecureGate — Reflection & Engineering Analysis
**Name:** Olowu Oluwakanyinsola Ibironke
**Cohort:** Design to MVP Bootcamp
**Live URL:** https://secure-gate-peach.vercel.app/
**GitHub Repo:** https://github.com/ronkus-ux/Secure-Gate

---

## Part 1 — What I Built

I built a full stack web application with Next.js, Prisma and PostgreSQL that is primarily focused on authentication and security. 
It handles the whole account process from signing up with an email and password, verifying that email using a link, logging in, and reaching a protected dashboard that only verified users can access, guarded by middleware and a server-side check.
I also added bcrypt-hashed passwords with a strength meter, error messages that do not reveal whether an account is taken or not, email verification using Resend with an expiry period, rate-limited sign in and forgot/reset password flow.

## Part 2 — What Surprised Me

My biggest surprise was realizing how even the speed of the error messages mattered - it could compromise the security of users, which was the whole point of the app. 
I always assumed that showing the same login error message was enough to keep it safe, but the speed of the reply still gave it away - a real email took about 100ms to check the password, while an unknown one replied instantly, so someone could time it to find out which emails had accounts.
I fixed it by making both replies take the same time, and it taught me that security is about how one designs these features to behave, not just what they display.

## Part 3 — Engineering Laws Quiz
 
### Q1 — Murphy's Law

**Code reference:** `src/lib/auth.ts` lines 17-18, 73-76; `src/lib/email/token.ts` lines 78-82.

**My Answer:** First, I wanted to hide which emails were registered, so I returned the same error message for a wrong password and an unregistered email. But I realised the speed still leaked it: an unregistered email came back instantly because there was no stored password to confirm its existence, while a real email took over 100ms. To fix it, I made the server always run a password check, using a fake hash when no account exists, so both replies take about the same time.

Second, when a user clicks on the resend verification button more than once, it could get confusing on which link works so I fixed it by deleting any earlier token for that email from the database before creating a new one, so only the latest link works.

**What goes wrong if ignored:** Without fixing the timing, an attacker would have been able to use it to measure how long the reply/messages takes and use it to determine whether an email is registered or not.  
Without deleting old tokens, every time a user clicks on the resend verification button, a link is left working so links that the user assumes are no longer working or dead still verify the account.

### Q2 — Law of Leaky Abstractions

**Code reference:** `src/lib/email/send.ts` lines 74, 105-117; `src/app/api/register/route.ts` lines 74-83.

**My Answer:** I picked Resend as the abstraction. Resend's job is to send emails for the app acting as a delivery agent so I assumed that sending the mail successfully to Resend meant the user has received the email. But successfully sending the message only meant that Resend received the mail to be sent, but it wasn't delivered. At first, emails reached only me, and I had no idea why other users weren't getting them, because I didn't own or verify a domain, which forced me to read the docs and understand. So to fix it, I had to own and verify a domain and add special codes called DNS records, which finally made emails reach everyone, not just me.  It also showed me that Resend can fail quietly; if I hadn't tested and read, I wouldn't have realised that no one gets the emails even when I see that it was successful, whether from an unverified domain, bad network or even too many emails. 
Resend looked simple at first, but when it failed, I realised even a simple tool could be complex so I had to understand it and set up my domain properly, verify and test thoroughly to make email work. That's the leak in the abstraction.

**What goes wrong if ignored:** If I had ignored this, emails wouldn't reach users, and since Resend doesn't really tell you if it fails, I might have thought it was working when it wasn't.

### Q3 — YAGNI

**Code reference:** `src/lib/auth.ts` lines 49-94; `prisma/schema.prisma` lines 24-116.

**My Answer:** I didn't add social login, multi-factor auth, or audit logs, because the task only required me to add email and password authentication, and building any of them would have meant creating a whole new system nobody asked for — a detour. Right now, signing in only requires email/password and there's no table in my database for MFA or for logs. Adding social login would have meant setting up an account with Google, building a special page Google sends people back to after they approve, and a new table to match those Google accounts to my users. MFA would have meant building and showing a QR code for the user to scan, adding a page to type the code, and backup recovery options in case the user loses their phone. Audit logs would have meant a new table, and writing a line into it every single time someone logs in, verifies or resets. Later I'd add them one at a time, only when asked or needed.

**What goes wrong if ignored:** I would have spent days on features nobody asked for, doubled the workload, added more code to secure, and introduced bugs in features that nobody even needed at that time or asked for. 

### Q4 — Kerckhoffs's Principle

**Code reference:** `src/app/api/register/route.ts` lines 13, 54; `src/lib/auth.ts` line 81; `prisma/schema.prisma` lines 37-39.

**My Answer:** A salt is like random text added to a password before the password gets hashed, and it comes differently for every user so even if two people use the same password, they will still have different hashes. bcrypt uses salt automatically so I don't have to do it manually and accidentally skip it, store it wrongly, so adding it makes hacking a lot harder. If I had used SHA-256 instead, there'd be no salt, which means identical passwords would produce identical hashes, and a table of pre-made common passwords and hashes could be used against mine to reverse and figure them out instantly. SHA-256 is also extremely fast, so an attacker could try billions of guesses a second, whereas bcrypt with 12 rounds takes about 300ms on purpose, to slow the attacker down. I didn't hide the method or algorithm as that's not what protects the users. The only thing that matters is that the password itself stays secret, not the method I use to protect it. 

**What goes wrong if ignored:** If I had used SHA-256 and ignored bcrypt, an attacker can guess passwords quickly and find their matches easily, and in cases where more than 1 user has the same password they will all have the same hash which makes it easier to figure out. Also they can try billions of passwords every second so fast that at some point, they would figure it out and get access. 

### Q5 — Postel's Law + Security by Design

**Code reference:** `src/app/api/forgot-password/route.ts` lines 55-79.

**My Answer:** I made the forgot password endpoint always return the same success message even if the email does not exist. If the address isn't registered, I skip creating the reset token and sending the email, but the browser gets the exact same response either way. I did this because if I told the truth, someone with a list of emails could use the endpoint to find out exactly who has an account, and that leaks which people use the app, which is a user privacy issue, so I just never confirm or deny. This decision was governed by Postel's Law, which explains that one should be careful and conservative about what I send so I don't give more detail than necessary, and the Security by Design principle, which emphasizes that security features should be built in from the start rather than added later like an afterthought.

**What goes wrong if ignored:** If I had ignored this, and used responses that depend on whether the email exists, attackers could have used it to figure out who has accounts, and maybe targeted them specifically.

### Q6 — The Boy Scout Rule

**Code reference:** `src/components/auth/AuthScreen.tsx` lines 10-40; `src/app/login/page.tsx` line 12; `src/app/register/page.tsx` line 12; `src/app/forgot-password/page.tsx` line 12.

**My Answer:** The first version used separate auth pages for login, register and forgot-password. I later noticed each page was repeating the same layout and title logic, and the codebase was getting big — login alone used to have almost 200 lines. Using three separate pages meant I had to update the same feature at different times and places, so I cleaned them up by restructuring the architecture to have only one auth page that contains the sign up form, the login form and every other auth form, rendering them conditionally. The three pages now have about 12 lines each, and a change meant for all the forms only needs to be made in one place.

**What goes wrong if ignored:** If I had ignored this, I would have spent more time maintaining separate pages, copying and pasting the same updates across each file. The codebase would also be more bloated, with more places to make a mistake.

### Q7 — Gall's Law

**Code reference:** `src/app/api/register/route.ts` lines 59-83; `src/lib/auth.ts` lines 49-94.

**My Answer:** SecureGate wasn't a full app from the start — it started as a scaffold that worked, then grew one phase at a time. Each phase depended on the one before, so I couldn't do phase 2 without 1 or phase 3 without 2. For example, a user had to register before they could log in, and a user had to exist before they could be emailed. The email setup had to exist before any email could be sent. That matches Gall's Law because each working version was the starting point for the one after it. If I had built all six phases together, I wouldn't have had a solid starting point to test against. 

**What goes wrong if ignored:** Building it one phase at a time meant each phase worked before I moved on. But if I ignored the law and tried to build all six phases at once, some parts wouldn't work because what they depend on isn't finished, so things would break in ways I didn't expect. One bug would cause another and they would pile up, so I wouldn't know where the problem actually came from. Normally I test after each small change, so when something breaks I know it was the last thing I did. But with everything done at once, I'd just be guessing, which would take so much to to fix.

### Q8 — The Law of Leaky Abstractions

**Code reference:** `prisma/schema.prisma` lines 24-27, 50-51; `prisma/migrations/20260929190222_init/migration.sql` lines 2-12.

**My Answer:** In the User model of my Prisma schema, it looked like the database would give each user an ID and automatically update the "last changed" time by itself. But when I checked the SQL that built the table, only the "date created" field was actually set by the database. The ID and "last changed" time are added by Prisma in my app before saving. This matters because the Prisma schema only describes the table, not the table itself.

**What goes wrong if ignored:** If another tool writes straight to the database without using Prisma, the ID would be missing and the save would fail. Also, there'd be no way to know when it was last updated.

### Q9 — Zawinski's Law

**Code reference:** `src/lib/rate-limit.ts` lines 29-59; `src/middleware.ts` line 42; `src/app/api/forgot-password/route.ts` lines 24-31.

**My Answer:** Next.js and NextAuth don't have built-in rate limiting, so I added `src/lib/rate-limit.ts` to stop repeated login attempts on the login route and spam on the forgot-password route. These were the only places that needed it, so I didn't build anything extra or general, just enough to cover those specific endpoints.

**What goes wrong if ignored:** Without rate limiting, attackers could try many passwords on the login route or spam password reset emails. 

### Q10 — Principle of Least Surprise

**Code reference:** `src/components/auth/LoginForm.tsx` line 57; `src/lib/auth.ts` lines 73-84.

**My Answer:** My login form shows an error message that says "Invalid email or password" when credentials are wrong. I chose this specific wording to prevent account enumeration. The Principle of Least Surprise means users expect the same generic response when login fails, so "Invalid email or password" fits and doesn't reveal whether an account exists.

**What goes wrong if ignored:** If I had ignored this and showed different messages for a wrong password and unregistered email, attackers could use it to find out which emails are registered. That would let them focus only on real accounts and make attacks like password guessing much easier. 

### Q11 — Murphy's Law + Defensive Programming

**Code reference:** `src/middleware.ts` lines 26-76; `src/app/dashboard/page.tsx` lines 25-57.

**My Answer:** I protect the /dashboard route with two checks. The middleware runs first and uses getToken() to look for a valid session token. If someone manually deletes their cookie and tries to go to /dashboard, getToken() returns null, so the middleware redirects them straight to /login before the dashboard page even loads. As a backup, the dashboard page also uses getServerSession() to check again and see if the user is still logged in. If there's no session, it redirects to /login. This is called defence in depth. 

According to Murphy's Law, anything that can go wrong will go wrong, so I didn't rely on just one check. This is defensive programming - planning for the worst case. In case the first check fails, the page itself would still block unauthenticated users.

**What goes wrong if ignored:** If I only relied on middleware, a typo in the matcher or forgetting to update it when adding a new page under /dashboard could mean the middleware never runs, leaving that page unprotected. If I only relied on the dashboard page check, there would be no early block before the page loads. With just one check, all it takes is one failure for an unauthenticated user to get in. With two checks, if one fails, the other one still holds.

### Q12 — Kerckhoffs's Principle + Technical Debt 

**Code reference:** `src/lib/auth.ts` lines 31-41; `src/middleware.ts` lines 58-61; `.gitignore` lines 29-34. 

**My Answer:** If my NEXTAUTH_SECRET was accidentally committed to GitHub, anyone could use it to forge valid session tokens and impersonate any user without a password. 

To recover from it, I'd first generate a new secret and update it in Vercel and my local .env.local. This would rotate the secret and all old session tokens would become invalid. Then I'd remove it from the entire git history. I'd also make sure .env.local remains in .gitignore to prevent committing the secret again. This ties to Kerckhoffs's Principle that the secret key must stay private, even if the method is known. Leaving it in history is also technical debt, because the longer it's out there, the more likely it's been copied.

**What goes wrong if ignored:** If I didn't rotate the secret and remove it from git history, an attacker could keep using it to forge session tokens and impersonate users to access protected routes like /dashboard. Just deleting the file from the latest commit wouldn't help, since it's still visible in older commits on GitHub. 

### Q13 — Conway's Law

**Code reference:** src/app/, src/app/api/, src/middleware.ts, src/components/, src/lib/, src/lib/email/, prisma/schema.prisma

**My Answer:** Since I built SecureGate solo, my folder structure mirrors my own thought process. I split it by concern: routes and pages, API handlers, route protection with middleware, UI, shared logic (like auth, rate limiting and email templates), and the database schema.

When building a feature, I start with the route, then protect it with middleware, handle the API logic, interact with the database through Prisma, and finally send an email if needed.

**What goes wrong if ignored:** If everything was mixed together, security checks would be easy to miss, logic wouldn't be reusable, and it'd be much harder to debug or extend the app as it grows. 

### Q14 — Technical Debt

**Code reference:** `src/lib/email/token.ts` lines 66-70, 71-85, 143-152

**My Answer:** One piece of technical debt in my codebase is in `src/lib/email/token.ts`. When someone requests a new verification email or a password reset, I need to delete their old token and create a brand new one so that only the newest link works.  

Right now, those two actions are done separately. If two requests come in at almost the same time, both could try to delete and create before the other one finishes. That would mean two tokens could end up being valid when only the newest one should be. 

I left it this way on purpose as a "small deliberate simplification", as noted in the comment on `src/lib/email/token.ts` lines 66-70. For this project with very few users, the chance of this happening is low, so it works fine for now. But this is technical debt, because as the app grows and more people click "Resend verification" or "Forgot password" links at the same time, old links could still be valid when they shouldn't be.

**Refactored Version:**
The comment in `src/lib/email/token.ts:66-70` calls this a "small deliberate simplification" and says wrapping them would be more correct. Following that hint, I'd use `prisma.$transaction()` to make deleteMany() and create() atomic so they run together as one unit.

export async function createVerificationToken(email: string): Promise<string> {
  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    prisma.verificationToken.create({
      data: { identifier: email, tokenHash, expires },
    }),
  ]);

  return token;
}

I'd do the same for password reset tokens. 

**What goes wrong if ignored:** If the app grows and more people click "Resend verification" or "Forgot password" links at the same time, old links could still work when they shouldn't. As the comment suggests, wrapping both actions in `prisma.$transaction()` would fix this by making sure they both happen together - atomic, so only the newest token ever stays valid. 

### Q15 — Synthesis Question

**Code reference:** `src/middleware.ts` lines 26-76; `src/app/dashboard/page.tsx` lines 25-57; `src/lib/auth.ts` lines 31-41; `src/components/auth/LoginForm.tsx` line 57; `src/app/api/forgot-password/route.ts` lines 55-79; `src/lib/email/token.ts` lines 66-70, 71-85; `prisma/schema.prisma`

**My Answer:** If I had to add Flutterwave payment integration to SecureGate to let users pay to unlock a premium dashboard, I wouldn't scrap anything. I'd extend the same patterns I already built. 

I'd never trust the client. Just like I already protect /dashboard (Q11), I'd verify every payment myself rather than trusting the redirect. I'd also need to verify webhooks in case the same notification comes through more than once.

I'd treat my Flutterwave keys the same way I did with my auth secret (Q12). They'd stay in environment variables and never go anywhere near the browser.

For errors, I'd keep them generic just like I do now. My login form uses "Invalid email or password" in src/components/auth/LoginForm.tsx and my forgot-password route in src/app/api/forgot-password/route.ts always gives the same response. With payments, I'd do the same and say something like "Your payment could not be processed. Please try another method.", and I'd also validate the amount, currency and product server-side against what I expect, never trusting what comes from the frontend or the redirect URL.

The biggest one to me would be preventing double actions. After seeing the comment in src/lib/email/token.ts lines 66-70 about deleting and creating tokens separately, both actions could happen at the wrong time. With money involved, a webhook retry could end up unlocking the premium dashboard twice. I'd make sure each payment can only be used once, and that confirming it and granting access happen together so nothing can slip in between.

**What goes wrong if ignored:** If I trusted the redirect URL, anyone could fake a successful payment and get the premium dashboard for free. If I didn't verify webhook signatures, use idempotency, or update both at the same time, retries could unlock it more than once. If I leaked my secret keys or trusted prices from the client, it would open the door to fraud. With just auth, the worst case is unauthorized access. With money involved, it's theft, broken user trust and real financial loss, so server-side verification, keeping secrets safe, and making updates atomic go from good practice to an absolute must.

## Part 4 — One Thing I Would Refactor

One thing I would refactor is how verification and password reset tokens are created in `src/lib/email/token.ts` lines 66-70, 71-85, 143-152. Right now, I delete old tokens with `deleteMany()` and create new ones with `create()` as separate steps. If two requests come in at almost the same time, both could run before the other finishes, leaving two tokens valid when only the newest one should work. 

I would refactor this to use `prisma.$transaction()` to make both operations atomic. That way, deleting old tokens and creating the new one happen together as one unit, so only the newest token stays valid.  

**Refactored Version:**

export async function createVerificationToken(email: string): Promise<string> {
  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    prisma.verificationToken.create({
      data: { identifier: email, tokenHash, expires },
    }),
  ]);

  return token;
}

I would do the same for password reset tokens. This would prevent old links from working if requests come in concurrently.

### Part 5 — How This Changes How I Build

To be honest, before this project, I thought building was just codes and features. But then I realized it's little things and details that matter so much and how important security details are. 

Like how I thought authentication was just checking if an email and password matched, but it's so much more than that. 

The timing leak was my biggest wake up call. I never would have thought that how fast the replies came in could tell someone if an email was registered. Having to run a fake hash so both replies took the same time made me realise I have to think about how things behave, not just what gets displayed. 

Working with Resend taught me not to trust abstractions. Just because it said it sent an email didn't mean anyone was getting it. Like I kept sending emails and checking, but nothing was coming in. It got frustrating, and I had to verify my domain and add DNS records to fix it. That forced me to actually read the docs and understand it myself. Just because something is written in code doesn't mean it's working. 

Protecting the dashboard also changed my mindset. I didn't want to rely on just one check, so having both middleware and the page itself check for a session really drilled defence in depth into me. Now I always ask "what if this check fails?" 

The token race condition stuck with me the most too. I never even thought about two requests coming in at the same time before this. Seeing that comment there made me realise that deleting old tokens and creating a new one in two separate steps isn't safe if both happen at the same time.

Now, I'm more cautious when I build. I ask more questions now. I try to only add what I actually need, I think more about what can go wrong, and I ask "how could this be abused?" a lot more than I used to. I care way more about the smallest details now, because I've seen firsthand how they can turn into the biggest problems.