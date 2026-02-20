# Road Condition Monitoring System

A web-based application for visualizing road conditions using an interactive map with color-coded road segments.

## Features

- **Interactive Map**: Built with Leaflet.js for smooth map interaction
- **Color-Coded Road Segments**: 
  - 🟢 Green (Excellent) - No issues
  - 🔵 Blue (Good) - Minor wear
  - 🟡 Yellow (Fair) - Some damage
  - 🔴 Red (Poor) - Needs repair
  - 🟤 Dark Red (Critical) - Unsafe
- **Detailed Information**: Click on any road segment to view details
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Legend**: Clear visualization of condition meanings

## How to Use

1. **Open the Application**: Simply open `index.html` in your web browser
2. **View Road Conditions**: The map displays different road segments with color coding
3. **Click on Roads**: Click any road segment to see detailed information
4. **Hover Effects**: Hover over roads to highlight them
5. **Refresh Data**: Use the refresh button to reload road data
6. **Toggle Legend**: Show/hide the legend using the control panel

## File Structure

```
├── index.html          # Main HTML file
├── styles.css          # Styling and layout
├── script.js           # JavaScript functionality
└── README.md          # Documentation
```

## Customization

### Changing the Map Center
In `script.js`, modify the coordinates in the `initMap()` function:
```javascript
map = L.map('map').setView([YOUR_LATITUDE, YOUR_LONGITUDE], ZOOM_LEVEL);
```

### Adding New Road Data
Edit the `roadData` array in `script.js`:
```javascript
{
    name: "Your Road Name",
    coordinates: [[lat1, lon1], [lat2, lon2], [lat3, lon3]],
    condition: "excellent", // or "good", "fair", "poor", "critical"
    lastInspected: "2026-02-17",
    issues: "Description of issues",
    trafficLevel: "Moderate"
}
```

### Changing Colors
Modify the `conditionColors` object in `script.js`:
```javascript
const conditionColors = {
    'excellent': '#YOUR_COLOR_CODE',
    'good': '#YOUR_COLOR_CODE',
    // ... etc
};
```

## Future Enhancements

- **Backend Integration**: Connect to a database for real-time data
- **User Authentication**: Admin panel for updating road conditions
- **Mobile App**: Native mobile application
- **Real-time Updates**: WebSocket integration for live data
- **Route Planning**: Suggest best routes based on road conditions
- **Reporting System**: Allow users to report road issues
- **Data Analytics**: Dashboard showing statistics and trends
- **Export Features**: Export reports as PDF

## Technologies Used

- **HTML5**: Structure
- **CSS3**: Styling with modern features (Grid, Flexbox, Gradients)
- **JavaScript (ES6+)**: Functionality
- **Leaflet.js**: Interactive mapping library
- **OpenStreetMap**: Map tiles

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Opera

## License

Free to use for educational and commercial purposes.

## Credits

- Map data: © OpenStreetMap contributors
- Mapping library: Leaflet.js

---

**Need Help?** Check the code comments or modify the sample data to match your location!
