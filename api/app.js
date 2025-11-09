const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const { exec } = require("child_process");

const BASE_DIR = process.env.BASE_DIR || "/opt/kuma_instances";
// const API_KEY = process.env.API_KEY || 'change-me';
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

function safeUsername(u) {
  return String(u)
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .slice(0, 40);
}

// function run(cmd, cwd) {
//   return new Promise((resolve, reject) => {
//     exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
//       if (err) return reject({ err, stdout, stderr });
//       resolve({ stdout, stderr });
//     });
//   });
// }

// Update the run function to return stdout
function run(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout: stdout.trim(), stderr }); // Trim whitespace from stdout
    });
  });
}

// Add this new function after your existing run() function
function getContainerStats(containerId) {
  return new Promise((resolve, reject) => {
    exec(
      `docker stats ${containerId} --no-stream --format "{\\"container\\":\\"{{.Container}}\\",\\"name\\":\\"{{.Name}}\\",\\"cpu\\":\\"{{.CPUPerc}}\\",\\"mem\\":\\"{{.MemUsage}}\\",\\"memPerc\\":\\"{{.MemPerc}}\\",\\"netIO\\":\\"{{.NetIO}}\\",\\"blockIO\\":\\"{{.BlockIO}}\\",\\"pids\\":\\"{{.PIDs}}\\"}"`,
      (err, stdout, stderr) => {
        if (err) return reject({ err, stderr });
        try {
          const stats = JSON.parse(stdout);
          resolve(stats);
        } catch (e) {
          reject({ error: "Failed to parse container stats", details: e });
        }
      }
    );
  });
}

// Update the getContainerId function
async function getContainerId(serviceName, username, cwd) {
  const { stdout } = await run(
    `docker compose ps -q uptime-kuma-${username}`,
    cwd
  );
  return stdout;
}

app.get("/", (req, res) => {
  res.send("🚀 Node API is live (via Traefik)");
});

app.post("/deploy", async (req, res) => {
  try {
    const { username, domain } = req.body;
    if (!username || !domain)
      return res.status(400).json({ error: "username and domain required" });

    const user = safeUsername(username);
    const instanceDir = path.join(BASE_DIR, user);

    // 1️⃣ Create directories
    await fs.ensureDir(instanceDir);
    await fs.ensureDir(path.join(instanceDir, "data"));

    // 2️⃣ Read template
    let template = await fs.readFile(
      path.join(__dirname, "../templates", "docker-compose.template.yml"),
      "utf8"
    );

    // 3️⃣ Replace placeholders
    template = template
      .replace(/\$\{USERNAME\}/g, user)
      .replace(/\$\{DOMAIN\}/g, domain);

    // 4️⃣ Write docker-compose.yml
    await fs.writeFile(
      path.join(instanceDir, "docker-compose.yml"),
      template,
      "utf8"
    );

    // Make the docker-compose.yml file executable
    await fs.chmod(path.join(instanceDir, "docker-compose.yml"), 0o755); // Set permissions to 755

    // 5️⃣ Bring up container
    await run("docker compose up -d", instanceDir);

    // Pass the username to getContainerId
    const containerId = await getContainerId("uptime-kuma", user, instanceDir);

    return res.json({
      ok: true,
      url: `https://${user}.${domain}`,
      containerId: containerId,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "deploy-failed", details: e });
  }
});

// Add this new endpoint before app.listen()
app.get("/container-stats/:containerId", async (req, res) => {
  try {
    const { containerId } = req.params;

    // Basic validation of container ID
    if (!containerId || containerId.length < 1) {
      return res.status(400).json({ error: "Container ID is required" });
    }

    const stats = await getContainerStats(containerId);
    res.json(stats);
  } catch (e) {
    console.error("Failed to get container stats:", e);
    res.status(500).json({
      error: "Failed to get container stats",
      details: e.stderr || e.message,
    });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
