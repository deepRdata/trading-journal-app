# Testing Checklist (MVP)

## Smoke tests
1. **Sign up / sign in**
   - Create account
   - Sign out
   - Sign back in

2. **Create a trade**
   - Trades → New trade
   - Verify Trade # auto-fills to max+1

3. **Add executions**
   - Add BUY (should label **Entry**)
   - Add BUY again (label **Add**)
   - Add SELL less than position (label **Partial Exit**)
   - Add final SELL to bring position to 0 (label **Final Exit**, trade status flips to CLOSED)

4. **Delete execution**
   - Delete a row and confirm actions relabel correctly

5. **Import Excel**
   - Import one month sheet
   - Verify trades count
   - Spot-check one trade’s executions and notes

## Known gaps (expected in MVP)
- Some Excel columns may have different header names; importer may need small mapping tweaks.
- Realized P/L uses average-cost accounting.

