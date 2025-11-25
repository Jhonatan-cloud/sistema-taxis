// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir carpeta "public"
app.use(express.static("public"));

// taxis[socketId] = { idTaxi, nombre, estado, lat, lng }
let taxis = {};

// servicios: { id, taxiSocketId, taxiNombre, direccion, estado }
let servicios = [];

io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // Registro de taxi desde taxi.html
  socket.on("registrarTaxi", (data) => {
    taxis[socket.id] = {
      idTaxi: data.idTaxi,
      nombre: data.nombre,
      estado: "disponible",
      lat: null,
      lng: null,
    };
    console.log("Taxi registrado:", taxis[socket.id]);
    enviarListaTaxis();
  });

  // Actualiza ubicación del taxi
  socket.on("actualizarUbicacion", (data) => {
    if (taxis[socket.id]) {
      taxis[socket.id].lat = data.lat;
      taxis[socket.id].lng = data.lng;
      io.emit("actualizacionUbicaciones", taxis);
    }
  });

  // Central asigna servicio
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

    // Enviar servicio al taxi
    io.to(data.socketIdTaxi).emit("nuevoServicio", servicio);

    enviarListaTaxis();
    io.emit("listaServicios", servicios);
  });

  // Taxi cambia estado del servicio
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

  // Audio en tiempo casi real (todos escuchan a todos)
  socket.on("audioChunk", (data) => {
    // data: { desde, buffer(ArrayBuffer) }
    io.emit("audioChunk", data);
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

// Ruta raíz (solo info)
app.get("/", (req, res) => {
  res.send("<h1>Sistema de taxis funcionando. Usa /central.html o /taxi.html</h1>");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});