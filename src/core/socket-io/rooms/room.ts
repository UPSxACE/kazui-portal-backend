import { Server } from "socket.io";

export default class Room {
  sv: Server;
  id: string;
  constructor(io: Server, id: string) {
    this.id = id;
    this.sv = io;
  }
  getActiveRoomClientsCount() {
    const room = this.sv.sockets.adapter.rooms.get(this.id);
    if (!room) return 0;
    return room.size;
  }
  getId() {
    return this.id;
  }
  emit(eventName: string, ...data: any[]) {
    this.sv.to(this.id).emit(eventName, ...data);
  }
}
