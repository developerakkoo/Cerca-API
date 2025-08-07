import Address from '../../Models/User/address.model.js';

// Create a new address
export const createAddress = async (req, res) => {
  try {
    const { addressLine, landmark, location, placeId, formattedAddress, id } = req.body;

    const address = new Address({
      addressLine,
      landmark,
      location,
      placeId,
      formattedAddress,
      user: id, // assuming user is authenticated
    });

    await address.save();
    res.status(201).json({ success: true, data: address });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get all addresses for a user
export const getUserAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.params.id });
    res.status(200).json({ success: true, data: addresses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get a single address by ID
export const getAddressById = async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.params.userId });

    if (!address) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    res.status(200).json({ success: true, data: address });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update an address
export const updateAddress = async (req, res) => {
  try {
    const updated = await Address.findOneAndUpdate(
      { _id: req.params.id, user: req.params.userId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete an address
export const deleteAddress = async (req, res) => {
  try {
    const deleted = await Address.findOneAndDelete({ _id: req.params.id});

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    res.status(200).json({ success: true, message: 'Address deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
