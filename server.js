// server.js
const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir carpeta public
app.use(express.static(path.join(__dirname, "public")));

// taxis[socketId] = { idTaxi, nombre, estado, lat, lng }
let taxis = {};
let servicios = [];

// CONEXIÓN SOCKET.IO
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  // Registrar taxi
  socket.on("registrarTaxi", (data) => {
    taxis[socket.id] = {
      idTaxi: data.idTaxi,
      nombre: data.nombre,
      estado: "disponible",
      lat: null,
      lng: null,
    };
    enviarListaTaxis();
  });

  // Actualizar ubicación del taxi
  socket.on("actualizarUbicacion", (data) => {
    if (taxis[socket.id]) {
      taxis[socket.id].lat = data.lat;
      taxis[socket.id].lng = data.lng;
      io.emit("actualizacionUbicaciones", taxis);
    }
  });

  // Asignar servicio desde central
  socket.on("asignarServicio", (data) => {
    const taxi = taxis[data.socketIdTaxi];
    if (!taxi) return;

    const servicio = {
      id: Date.now(),
      taxiSocketId: data.socketIdTaxi,
      taxiNombre: taxi.nombre,
      direccion: data.direccion,
      estado: "asignado",
    };

    servicios.push(servicio);
    taxi.estado = "ocupado";

    io.to(data.socketIdTaxi).emit("nuevoServicio", servicio);

    enviarListaTaxis();
    io.emit("listaServicios", servicios);
  });

  // Cambiar estado de servicio (taxi)
  socket.on("estadoServicio", (data) => {
    const servicio = servicios.find((s) => s.id === data.idServicio);
    if (!servicio) return;

    servicio.estado = data.nuevoEstado;

    if (data.nuevoEstado === "finalizado" && taxis[socket.id]) {
      taxis[socket.id].estado = "disponible";
    }

    enviarListaTaxis();
    io.emit("listaServicios", servicios);
  });

  // Chat texto
  socket.on("mensajeChat", (data) => {
    io.emit("mensajeChat", data);
  });

  // AUDIO PUSH-TO-TALK
  // data: { desde, chunk } donde chunk es un Blob que Socket.io envía como binario
  socket.on("audioChunk", (data) => {
    io.emit("audioChunk", data); // todos escuchan todo
  });

  // Desconexión
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
    if (taxis[socket.id]) {
      delete taxis[socket.id];
      enviarListaTaxis();
    }
  });
});

function enviarListaTaxis() {
  io.emit("listaTaxis", taxis);
}

// Ruta raíz
app.get("/", (req, res) => {
  res.send("<h1>Sistema de taxis activo. Usa /central.html o /taxi.html</h1>");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});