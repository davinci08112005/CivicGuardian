import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize Database
const db = new Database('civic_guardian.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL, -- 'insight' or 'chat'
    content_id TEXT,
    rating INTEGER NOT NULL, -- 1 for up, -1 for down
    comment TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const PORT = 3000;

  const isProduction = process.env.NODE_ENV === "production" || process.env.DISABLE_HMR === "true";

  httpServer.on('upgrade', (request, socket, head) => {
    const { url } = request;
    try {
      if (url && (url === '/ws' || url.startsWith('/ws?'))) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else if (isProduction) {
        // In production or when HMR is disabled, we only allow our specific /ws path
        socket.destroy();
      }
      // In development, we let other potential upgrade listeners (like Vite) 
      // handle the request if it's not for our /ws endpoint.
    } catch (err) {
      if (!isProduction) {
        console.error("WebSocket upgrade error:", err);
      }
      socket.destroy();
    }
  });

  app.use(express.json());

  // In-memory data store for simulation
  let emergencyData: any[] = [];
  const DISTRICTS = ["Bethesda", "Silver Spring", "Rockville", "Gaithersburg", "Germantown", "Wheaton"];
  const INCIDENT_TYPES = ["Traffic Accident", "Medical Emergency", "Fire Alarm", "Police Assistance", "Public Service", "Assault", "Theft"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Initialize with some data
  const initializeData = () => {
    const now = new Date();
    for (let i = 0; i < 1000; i++) {
      const date = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
      const hour = date.getHours();
      let incidentType = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
      if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
        if (Math.random() > 0.5) incidentType = "Traffic Accident";
      }
      emergencyData.push({
        id: Math.random().toString(36).substr(2, 9),
        incident_type: incidentType,
        timestamp: date.toISOString(),
        hour: hour,
        dayOfWeek: DAYS[date.getDay()],
        location: DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)],
        latitude: 39.0458 + (Math.random() - 0.5) * 0.2,
        longitude: -77.1068 + (Math.random() - 0.5) * 0.2,
        priority: Math.random() > 0.8 ? "High" : "Medium",
        district: DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)],
      });
    }
    emergencyData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  initializeData();

  // WebSocket connection handling
  wss.on("connection", (ws) => {
    if (!isProduction) {
      console.log("Client connected to real-time alerts");
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'system', message: 'Connected to CivicGuardian Alert Stream' }));
    }
    
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 20000);

    ws.on("close", () => {
      if (!isProduction) {
        console.log("Client disconnected");
      }
      clearInterval(pingInterval);
    });
  });

  // Real-time Monitoring & Anomaly Detection
  setInterval(() => {
    // 1. Simulate new incoming calls from "Open Data Portal"
    const newCallsCount = Math.floor(Math.random() * 3);
    const now = new Date();
    const newCalls = [];

    for (let i = 0; i < newCallsCount; i++) {
      const district = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
      const type = INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
      const call = {
        id: Math.random().toString(36).substr(2, 9),
        incident_type: type,
        timestamp: now.toISOString(),
        hour: now.getHours(),
        dayOfWeek: DAYS[now.getDay()],
        location: district,
        latitude: 39.0458 + (Math.random() - 0.5) * 0.2,
        longitude: -77.1068 + (Math.random() - 0.5) * 0.2,
        priority: Math.random() > 0.9 ? "High" : "Medium",
        district: district,
      };
      newCalls.push(call);
      emergencyData.push(call);
    }

    // Broadcast new calls to all connected clients
    if (newCalls.length > 0) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'data_update', 
            data: newCalls,
            source: 'Montgomery Open Data Portal',
            timestamp: now.toISOString()
          }));
        }
      });
    }

    // Keep data size manageable (last 2000 records)
    if (emergencyData.length > 2000) {
      emergencyData = emergencyData.slice(-2000);
    }

    // 2. Anomaly Detection Logic
    // Check for spikes in the last 10 minutes compared to the last hour
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentCalls = emergencyData.filter(d => new Date(d.timestamp) > tenMinsAgo);
    const hourlyCalls = emergencyData.filter(d => new Date(d.timestamp) > hourAgo);

    DISTRICTS.forEach(district => {
      const districtRecent = recentCalls.filter(d => d.district === district).length;
      const districtHourly = hourlyCalls.filter(d => d.district === district).length;

      // If recent 10 mins has more than 40% of the hourly volume, it's a spike
      if (districtRecent > 3 && districtRecent > (districtHourly * 0.4)) {
        const dominantType = recentCalls
          .filter(d => d.district === district)
          .reduce((acc: any, curr) => {
            acc[curr.incident_type] = (acc[curr.incident_type] || 0) + 1;
            return acc;
          }, {});
        
        const topType = Object.entries(dominantType).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "Emergency";

        const alert = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'Anomaly',
          title: `Spike Detected: ${district}`,
          description: `Unusual increase in ${topType} calls detected in ${district}. ${districtRecent} calls in the last 10 minutes.`,
          location: district,
          timestamp: now.toISOString(),
          severity: districtRecent > 6 ? 'high' : 'medium'
        };

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'alert', data: alert }));
          }
        });
      }
    });
  }, 30000); // Check every 30 seconds

  // API: Emergency Data
  app.get("/api/emergency-data", (req, res) => {
    res.json(emergencyData);
  });

  // API: Bright Data Simulation / Integration
  // In a real scenario, this would call the Bright Data Crawl API
  app.get("/api/contextual-data", async (req, res) => {
    // Simulating Bright Data Crawl results for Montgomery County
    const contextualData = {
      events: [
        { name: "Rockville Town Square Concert", location: "Rockville", time: "19:00", impact: "High Traffic", lat: 39.08, lng: -77.15 },
        { name: "Farmers Market", location: "Bethesda", time: "09:00", impact: "Moderate Pedestrian", lat: 39.00, lng: -77.10 },
        { name: "High School Football Game", location: "Gaithersburg", time: "18:30", impact: "High Traffic", lat: 39.14, lng: -77.20 }
      ],
      traffic_alerts: [
        { road: "I-270", status: "Heavy Congestion", cause: "Construction" },
        { road: "MD-355", status: "Slow", cause: "Unknown" }
      ],
      weather: { condition: "Rainy", temperature: "68F", visibility: "Low" }
    };
    
    // If BRIGHT_DATA_API_KEY existed, we'd do:
    // const response = await fetch('https://api.brightdata.com/...', { headers: { 'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_KEY}` } });
    // const data = await response.json();
    
    res.json(contextualData);
  });

  // API: User Feedback
  app.post("/api/feedback", (req, res) => {
    const { contentType, contentId, rating, comment } = req.body;
    
    if (!contentType || rating === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const stmt = db.prepare('INSERT INTO feedback (content_type, content_id, rating, comment) VALUES (?, ?, ?, ?)');
      stmt.run(contentType, contentId || null, rating, comment || null);
      res.json({ success: true });
    } catch (err) {
      console.error("Database error:", err);
      res.status(500).json({ error: "Failed to store feedback" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`CivicGuardian Server running on http://localhost:${PORT}`);
  });
}

startServer();
