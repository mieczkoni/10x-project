# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - heading "Log in" [level=1] [ref=e6]
        - paragraph [ref=e7]: Welcome back. Enter your details to continue.
      - generic [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e10]: Email
          - textbox "Email" [ref=e11]
        - generic [ref=e12]:
          - generic [ref=e13]: Password
          - textbox "Password" [active] [ref=e14]
        - button "Log in" [disabled]
      - generic [ref=e15]:
        - link "Forgot password?" [ref=e16] [cursor=pointer]:
          - /url: /forgot-password
        - link "Create account" [ref=e17] [cursor=pointer]:
          - /url: /signup
  - generic [ref=e20]:
    - button "Menu" [ref=e21]:
      - img [ref=e23]
      - generic: Menu
    - button "Inspect" [ref=e27]:
      - img [ref=e29]
      - generic: Inspect
    - button "Audit" [ref=e31]:
      - img [ref=e33]
      - generic: Audit
    - button "Settings" [ref=e36]:
      - img [ref=e38]
      - generic: Settings
```