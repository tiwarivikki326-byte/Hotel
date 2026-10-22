# QR Menu – रेस्टोरेंट QR मेन्यू वेबसाइट

## Kaise chalayein / How to run
1. **Node.js** install karein (https://nodejs.org – LTS version, 16 ya usse naya).
2. Is folder mein terminal / command prompt kholein aur chalayein:
   ```
   node server.js
   ```
   (Windows par `start.bat` par double-click bhi kar sakte hain.)
3. Browser mein kholein:
   - Customer menu: http://localhost:3000/
   - Admin panel:   http://localhost:3000/admin

**Pehli login:** username `admin`, password `admin123`  → login ke baad **Settings** mein jaakar turant badal dein.

## Features (client ki requirement ke hisaab se)
**Customer side**
- Sabse upar **हिंदी | English** button – customer jo chunega, poora menu usi language mein dikhega (yaad bhi rakhta hai).
- Menu, har item ka price, photo, video (agar admin ne dala ho), description.
- Item available hai ya nahi – "Available / Not available" tag.
- Customer menu dekhkar waiter ko order bolta hai.
- Menu ke neeche **Review button** – customer seedha restaurant ka review de sakta hai.
- Search aur category filter.
- QR scan karne par table number automatically dikhta hai (`/?table=5`).

**Admin panel** (`/admin`)
- Username + password se login.
- Menu mein item **add / edit / delete**.
- Har item ka price, available ON/OFF switch, Hindi + English naam aur description.
- Photo aur video upload (video optional, kabhi bhi hata sakte hain).
- **QR Codes** tab – table 1…N ke liye print-ready QR codes.
- **Settings** tab – restaurant ka naam, tagline, review link, password badalna.

## QR code kaise lagayein
1. Website ko internet par live karein (VPS / Render / Railway / koi bhi Node hosting) ya restaurant ke Wi-Fi par chalayein.
2. Admin → **QR Codes** → "Website address" mein apna live address daalein (jaise `https://myrestaurant.com`) → **Generate** → **Print**.
3. Har table par ek QR chipka dein.

## Data kahan save hota hai
- `data/menu.json` – menu items
- `data/settings.json` – restaurant settings aur admin login (password hashed hota hai)
- `data/uploads/` – photos aur videos

Backup ke liye bas `data` folder copy kar lein. Port badalna ho to: `PORT=8080 node server.js`

## Folder structure
```
server.js          – backend (koi extra package nahi chahiye)
public/index.html  – customer menu
public/admin.html  – admin panel
public/css, js     – styling aur scripts
data/              – menu, settings, uploads
```
