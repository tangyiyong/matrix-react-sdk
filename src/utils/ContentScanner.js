import MatrixClientPeg from "../MatrixClientPeg";
import 'isomorphic-fetch';
import {PkEncryption} from "olm";
import Promise from "bluebird";
import {decryptFile} from "./DecryptFile";

function generateError(state, message) {
	return {
		clean: state,
		error: message
	}
}

function generateSettings() {
	const baseUrl = MatrixClientPeg.get()['baseUrl'];
	return {
		publicKeyUrl: `${baseUrl}/_matrix/media_proxy/unstable/public_key`,
		scanEncryptedUrl: `${baseUrl}/_matrix/media_proxy/unstable/scan_encrypted`,
		scanUnencryptedUrl: `${baseUrl}/_matrix/media_proxy/unstable/scan/`,
		downloadUnencryptedUrl: `${baseUrl}/_matrix/media_proxy/unstable/download/`,
		downloadUnencryptedThumnailUrl: `${baseUrl}/_matrix/media_proxy/unstable/thumbnail/`,
		thumbnailParams: '?width=800&height=600&method=scale',
	}
}

export async function scanContent(content) {
	const settings = generateSettings();

	if (content.file !== undefined) {
		let publicKey;
		try {
			const publicKeyData = await fetch(settings.publicKeyUrl);
			const publicKeyObject = await publicKeyData.json();
			publicKey = publicKeyObject.public_key;
		} catch (err) {
			console.warn(`Unable to retrive the publicKey : ${err}`);
		}

		let body;
		if (publicKey) {
			// Setting up the encryption
			const encryption = new PkEncryption();
			encryption.set_recipient_key(publicKey);
			body = {encrypted_body: encryption.encrypt(JSON.stringify({file: content.file}))};
		} else {
			body = {file: content.file};
		}

		return Promise.resolve(fetch(settings.scanEncryptedUrl,{
			headers: {
				'Content-Type': 'application/json'
			},
			method: "POST",
			body: JSON.stringify(body)
		})
			.then(res => { return res.json(); })
			.then(data => {
				return data;
			}).catch(err => {
				console.error(err);
				return generateError(false, 'Error: Unable to join the MCS server')
		}));
	} else if (content.url !== undefined) {
		const fileUrl = content.url.split('//')[1];

		return Promise.resolve(fetch(`${settings.scanUnencryptedUrl}${fileUrl}`)
			.then(res => { return res.json(); })
			.then(data => {
				return data;
			}).catch(err => {
				console.error(err);
				return generateError(false, "Error: Cannot fetch the file");
		}));
	} else {
		return generateError(false, 'Error: This is not a matrix content');
	}
}

export function downloadContent(content, isThumb = false) {
	const settings = generateSettings();

	if (content.url !== undefined) {
		let fileUrl = content.url.split('//')[1];
		let url;
		if (isThumb) {
			url = `${settings.downloadUnencryptedThumnailUrl}${fileUrl}${settings.thumbnailParams}`;
		} else {
			url = `${settings.downloadUnencryptedUrl}${fileUrl}`;
		}
		return url;
	} else {
		return generateError(false, 'Error: This is not a matrix content');
	}
}

export async function downloadContentEncrypted(content, isThumb = false) {
	if (content.file !== undefined || content.info.thumbnail_file !== undefined) {
		let file = isThumb ? content.info.thumbnail_file : content.file;
		let blob = await decryptFile(file);

		if (blob) {
			return blob;
		} else {
			return new Blob([], {type: 'application/octet-stream'});
		}

	} else {
		return generateError(false, 'Error: This is not a matrix content');
	}
}
