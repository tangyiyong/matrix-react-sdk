/*
Copyright 2016 OpenMarket Ltd
Copyright 2017 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import MatrixClientPeg from './MatrixClientPeg';
import MultiInviter from './utils/MultiInviter';
import Modal from './Modal';
import { getAddressType } from './UserAddress';
import createRoom from './createRoom';
import sdk from './';
import dis from './dispatcher';
import DMRoomMap from './utils/DMRoomMap';
import { _t } from './languageHandler';

export function inviteToRoom(roomId, addr) {
    const addrType = getAddressType(addr);

    if (addrType == 'email') {
        return MatrixClientPeg.get().inviteByEmail(roomId, addr);
    } else if (addrType == 'mx-user-id') {
        return MatrixClientPeg.get().invite(roomId, addr);
    } else {
        throw new Error('Unsupported address');
    }
}

/**
 * Invites multiple addresses to a room
 * Simpler interface to utils/MultiInviter but with
 * no option to cancel.
 *
 * @param {string} roomId The ID of the room to invite to
 * @param {string[]} addrs Array of strings of addresses to invite. May be matrix IDs or 3pids.
 * @returns {Promise} Promise
 */
export function inviteMultipleToRoom(roomId, addrs) {
    const inviter = new MultiInviter(roomId);
    return inviter.invite(addrs);
}

export function showStartChatInviteDialog() {
    const AddressPickerDialog = sdk.getComponent("dialogs.AddressPickerDialog");
    Modal.createTrackedDialog('Start a chat', '', AddressPickerDialog, {
        title: _t('Start a chat'),
        description: _t("Who would you like to communicate with?"),
        placeholder: _t("Email, name or matrix ID"),
        button: _t("Start Chat"),
        onFinished: _onStartChatFinished,
    });
}

export function showRoomInviteDialog(roomId) {
    const AddressPickerDialog = sdk.getComponent("dialogs.AddressPickerDialog");
    Modal.createTrackedDialog('Chat Invite', '', AddressPickerDialog, {
        title: _t('Invite new room members'),
        description: _t('Who would you like to add to this room?'),
        button: _t('Send Invites'),
        placeholder: _t("Email, name or matrix ID"),
        onFinished: (shouldInvite, addrs) => {
            _onRoomInviteFinished(roomId, shouldInvite, addrs);
        },
    });
}


function selectRoom(addrTexts) {

    let roomCandidate = new Map();
    let selectedRoom = null;

    console.log("========== ADDRTEXTS");
    console.log(addrTexts);
    console.log(addrTexts);

    const dmRooms = new DMRoomMap(MatrixClientPeg.get()).getDMRoomsForUserId(addrTexts[0]);
    console.log("========== DMROOMS");
    console.log(dmRooms);



    dmRooms.forEach(r => {
        let room = MatrixClientPeg.get().getRoom(r);
        console.log("~~~~~~~~~~ ROOM");
        console.log(room);
        if (room) {
            let me = room.getMember(MatrixClientPeg.get().credentials.userId);
            console.log("~~~~~~~~~~ ME");
            console.log(me);

            // Later, do something for selecting only last created
            roomCandidate.set(me.membership, me);
        }
    });

    if (roomCandidate.has("join")) {
        selectedRoom = roomCandidate.get("join").roomId;
    } else if (roomCandidate.has("invite")) {
        selectedRoom = roomCandidate.get("invite").roomId;
    } else {
        selectedRoom = null;
    }
    return selectedRoom;
}

function _onStartChatFinished(shouldInvite, addrs) {
    if (!shouldInvite) return;
    const addrTexts = addrs.map((addr) => addr.address);

    selectRoom(addrTexts);

    console.log(">>>>>>>>>> addrs");
    console.log(addrs);
    console.log(">>>>>>>>>> addrTexts");
    console.log(addrTexts);

    if (_isDmChat(addrTexts)) {
        const rooms = [];
        let selectedRoom = selectRoom(addrTexts);
        console.log(">>>>>>>>>> selectedRoom");
        console.log(selectedRoom);

        const room = MatrixClientPeg.get().getRoom(selectedRoom);
        rooms.push(typeof room !== "undefined" ? room : _getDirectMessageRooms(addrTexts[0]));

        console.log(">>>>>>>>>> rooms");
        console.log(rooms);
        console.log(">>>>>>>>>> findIndex");
        console.log(rooms.some(e => {return (e !== null)}));

        if (rooms.length > 0 && rooms.some(e => {return (e !== null)})) {
            MatrixClientPeg.get().joinRoom(selectedRoom).done(() => {
                console.log("ROOM JOINED !!!");
            }, (err) => {
                console.log("OOPS SMTH WENT WRONG !!");
                dis.dispatch({
                    action: 'join_room_error',
                    err: err,
                });
                const msg = err.message ? err.message : JSON.stringify(err);
                const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                Modal.createTrackedDialog('Failed to join room', '', ErrorDialog, {
                    title: _t("Failed to join room"),
                    description: msg,
                });
            });
            dis.dispatch({
                action: 'view_room',
                room_id: rooms[0].roomId,
            });
        } else {
            // Start a new DM chat
            createRoom({dmUserId: addrTexts[0]}).catch((err) => {
                const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                Modal.createTrackedDialog('Failed to invite user', '', ErrorDialog, {
                    title: _t("Failed to invite user"),
                    description: ((err && err.message) ? err.message : _t("Operation failed")),
                });
            });
        }
    } else {
        // Start multi user chat
        let room;
        createRoom().then((roomId) => {
            room = MatrixClientPeg.get().getRoom(roomId);
            return inviteMultipleToRoom(roomId, addrTexts);
        }).then((addrs) => {
            return _showAnyInviteErrors(addrs, room);
        }).catch((err) => {
            console.error(err.stack);
            const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
            Modal.createTrackedDialog('Failed to invite', '', ErrorDialog, {
                title: _t("Failed to invite"),
                description: ((err && err.message) ? err.message : _t("Operation failed")),
            });
        });
    }
}

function _onRoomInviteFinished(roomId, shouldInvite, addrs) {
    if (!shouldInvite) return;

    const addrTexts = addrs.map((addr) => addr.address);

    // Invite new users to a room
    inviteMultipleToRoom(roomId, addrTexts).then((addrs) => {
        const room = MatrixClientPeg.get().getRoom(roomId);
        return _showAnyInviteErrors(addrs, room);
    }).catch((err) => {
        console.error(err.stack);
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Failed to invite', '', ErrorDialog, {
            title: _t("Failed to invite"),
            description: ((err && err.message) ? err.message : _t("Operation failed")),
        });
    });
}

function _isDmChat(addrTexts) {
    if (addrTexts.length === 1 && getAddressType(addrTexts[0]) === 'mx-user-id') {
        return true;
    } else {
        return false;
    }
}

function _showAnyInviteErrors(addrs, room) {
    // Show user any errors
    const errorList = [];
    for (const addr of Object.keys(addrs)) {
        if (addrs[addr] === "error") {
            errorList.push(addr);
        }
    }

    if (errorList.length > 0) {
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Failed to invite the following users to the room', '', ErrorDialog, {
            title: _t("Failed to invite the following users to the %(roomName)s room:", {roomName: room.name}),
            description: errorList.join(", "),
        });
    }
    return addrs;
}

function _getDirectMessageRooms(addr) {
    const dmRoomMap = new DMRoomMap(MatrixClientPeg.get());
    const dmRooms = dmRoomMap.getDMRoomsForUserId(addr);
    const rooms = [];
    dmRooms.forEach((dmRoom) => {
        const room = MatrixClientPeg.get().getRoom(dmRoom);
        if (room) {
            const me = room.getMember(MatrixClientPeg.get().credentials.userId);
            if (me.membership == 'join') {
                rooms.push(room);
            }
        }
    });
    return rooms;
}

