/*
Copyright 2017 Vector Creations Ltd

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
import React from 'react';
import sdk from '../../../index';
import classNames from 'classnames';
import { Room, RoomMember } from 'matrix-js-sdk';
import PropTypes from 'prop-types';
import MatrixClientPeg from '../../../MatrixClientPeg';
import { MATRIXTO_URL_PATTERN } from '../../../linkify-matrix';
import { getDisplayAliasForRoom } from '../../../Rooms';

const REGEX_MATRIXTO = new RegExp(MATRIXTO_URL_PATTERN);

// For URLs of matrix.to links in the timeline which have been reformatted by
// HttpUtils transformTags to relative links
const REGEX_LOCAL_MATRIXTO = /^#\/(?:user|room)\/(([\#\!\@\+]).*)$/;

export default React.createClass({
    statics: {
        isPillUrl: (url) => {
            return !!REGEX_MATRIXTO.exec(url);
        },
        isMessagePillUrl: (url) => {
            return !!REGEX_LOCAL_MATRIXTO.exec(url);
        },
    },

    props: {
        // The URL to pillify (no validation is done, see isPillUrl and isMessagePillUrl)
        url: PropTypes.string,
        // Whether the pill is in a message
        inMessage: PropTypes.bool,
        // The room in which this pill is being rendered
        room: PropTypes.instanceOf(Room),
    },

    render: function() {
        const MemberAvatar = sdk.getComponent('avatars.MemberAvatar');
        const RoomAvatar = sdk.getComponent('avatars.RoomAvatar');

        let regex = REGEX_MATRIXTO;
        if (this.props.inMessage) {
            regex = REGEX_LOCAL_MATRIXTO;
        }

        // Default to the empty array if no match for simplicity
        // resource and prefix will be undefined instead of throwing
        const matrixToMatch = regex.exec(this.props.url) || [];

        const resource = matrixToMatch[1]; // The room/user ID
        const prefix = matrixToMatch[2]; // The first character of prefix

        // Default to the room/user ID
        let linkText = resource;

        const isUserPill = prefix === '@';
        const isRoomPill = prefix === '#' || prefix === '!';

        let avatar = null;
        let userId;
        if (isUserPill) {
            // If this user is not a member of this room, default to the empty member
            // TODO: This could be improved by doing an async profile lookup
            const member = this.props.room.getMember(resource) ||
                new RoomMember(null, resource);
            if (member) {
                userId = member.userId;
                linkText = member.rawDisplayName;
                avatar = <MemberAvatar member={member} width={16} height={16}/>;
            }
        } else if (isRoomPill) {
            const room = prefix === '#' ?
                MatrixClientPeg.get().getRooms().find((r) => {
                    return r.getAliases().includes(resource);
                }) : MatrixClientPeg.get().getRoom(resource);

            if (room) {
                linkText = (room ? getDisplayAliasForRoom(room) : null) || resource;
                avatar = <RoomAvatar room={room} width={16} height={16}/>;
            }
        }

        const classes = classNames({
            "mx_UserPill": isUserPill,
            "mx_RoomPill": isRoomPill,
            "mx_UserPill_me": userId === MatrixClientPeg.get().credentials.userId,
        });

        if ((isUserPill || isRoomPill) && avatar) {
            return this.props.inMessage ?
                <a className={classes} href={this.props.url} title={resource}>
                    {avatar}
                    {linkText}
                </a> :
                <span className={classes} title={resource}>
                    {avatar}
                    {linkText}
                </span>;
        } else {
            // Deliberately render nothing if the URL isn't recognised
            return null;
        }
    },
});