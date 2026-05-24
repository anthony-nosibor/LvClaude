import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Button,
  Image,
} from 'react-native';
import { Camera } from 'expo-camera';
import * as Print from 'expo-print';
import SignatureView from 'react-native-signature-canvas';
import { db } from '../firebase'; // Import the db object

const LettreDeVoitureScreen = () => {
  const [expediteur, setExpediteur] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [lieuChargement, setLieuChargement] = useState('');
  const [lieuLivraison, setLieuLivraison] = useState('');
  const [marchandise, setMarchandise] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const cameraRef = useRef<Camera>(null);
  const signatureRef = useRef<any>(null);

  const askForCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setPhoto(photo.uri);
    }
  };

  const handleSignature = (signature: string) => {
    setSignature(signature);
  };

  const handleClear = () => {
    signatureRef.current.clearSignature();
    setSignature(null);
  }

  const handleConfirm = () => {
    signatureRef.current.readSignature();
  }


  const generatePdf = async () => {
    const html = `
          <html>
            <body>
              <h1>Lettre de Voiture</h1>
              <p><b>Expéditeur:</b> ${expediteur}</p>
              <p><b>Destinataire:</b> ${destinataire}</p>
              <p><b>Lieu de chargement:</b> ${lieuChargement}</p>
              <p><b>Lieu de livraison:</b> ${lieuLivraison}</p>
              <p><b>Marchandise:</b> ${marchandise}</p>
              ${photo ? `<img src="${photo}" style="width: 200px;" />` : ''}
              ${signature ? `<img src="${signature}" style="width: 200px;" />` : ''}
            </body>
          </html>
        `;

    await Print.printAsync({ html });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Lettre de Voiture</Text>

      <Text style={styles.label}>Expéditeur</Text>
      <TextInput
        style={styles.input}
        value={expediteur}
        onChangeText={setExpediteur}
        placeholder="Nom et adresse de l'expéditeur"
      />

      <Text style={styles.label}>Destinataire</Text>
      <TextInput
        style={styles.input}
        value={destinataire}
        onChangeText={setDestinataire}
        placeholder="Nom et adresse du destinataire"
      />

      <Text style={styles.label}>Lieu de chargement</Text>
      <TextInput
        style={styles.input}
        value={lieuChargement}
        onChangeText={setLieuChargement}
        placeholder="Lieu de chargement"
      />

      <Text style={styles.label}>Lieu de livraison</Text>
      <TextInput
        style={styles.input}
        value={lieuLivraison}
        onChangeText={setLieuLivraison}
        placeholder="Lieu de livraison"
      />

      <Text style={styles.label}>Marchandise</Text>
      <TextInput
        style={styles.input}
        value={marchandise}
        onChangeText={setMarchandise}
        placeholder="Description de la marchandise"
      />

      <Text style={styles.label}>Photo de la marchandise</Text>
      {hasPermission === null && (
        <Button title="Demander l'autorisation de la caméra" onPress={askForCameraPermission} />
      )}
      {hasPermission === false && <Text>L'accès à la caméra a été refusé.</Text>}
      {hasPermission && !photo && (
        <View>
          <Camera style={{ flex: 1, aspectRatio: 1 }} ref={cameraRef} />
          <Button title="Prendre une photo" onPress={takePicture} />
        </View>
      )}
      {photo && <Image source={{ uri: photo }} style={{ width: 200, height: 200 }} />}

      <Text style={styles.label}>Signature</Text>
      <View style={styles.signatureContainer}>
        <SignatureView
            ref={signatureRef}
            onOK={handleSignature}
            webStyle={`.m-signature-pad--footer {display: none}`}
        />
        <View style={styles.signatureButtons}>
            <Button title="Vider" onPress={handleClear} />
            <Button title="Confirmer" onPress={handleConfirm} />
        </View>
      </View>
      {signature && (
        <View style={{alignItems: 'center', marginTop: 10}}>
            <Text>Signature enregistrée:</Text>
            <Image
                resizeMode={'contain'}
                style={{ width: 300, height: 150 }}
                source={{ uri: signature }}
            />
        </View>
      )}


      <Button title="Générer le PDF" onPress={generatePdf} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  signatureContainer: {
    height: 250,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginTop: 5,
  },
  signatureButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
});

export default LettreDeVoitureScreen;
