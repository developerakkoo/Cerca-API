const Coupon = require('../../Models/Admin/coupon.modal');

/**
 * @desc    Add a new coupon
 * @route   POST /coupons
 */
const addCoupon = async (req, res) => {
    try {
        // Validate and parse date strings into Date objects
        if (req.body.startDate) {
            const startDate = new Date(req.body.startDate);
            if (isNaN(startDate)) {
                return res.status(400).json({ message: 'Invalid startDate format. Use YYYY-MM-DD.' });
            }
            req.body.startDate = startDate;
        }
        if (req.body.validUntil) {
            const validUntil = new Date(req.body.validUntil);
            if (isNaN(validUntil)) {
                return res.status(400).json({ message: 'Invalid validUntil format. Use YYYY-MM-DD.' });
            }
            req.body.validUntil = validUntil;
        }

        const coupon = new Coupon(req.body);
        await coupon.save();
        res.status(201).json({ message: 'Coupon added successfully', coupon });
    } catch (error) {
        res.status(500).json({ message: 'Error adding coupon', error });
    }
};

/**
 * @desc    Get all coupons
 * @route   GET /coupons
 */
const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find();
        res.status(200).json(coupons);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching coupons', error });
    }
};

/**
 * @desc    Get a single coupon by ID
 * @route   GET /coupons/:id
 */
const getCouponById = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.status(200).json(coupon);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching coupon', error });
    }
};

/**
 * @desc    Update a coupon by ID
 * @route   PUT /coupons/:id
 */
const updateCoupon = async (req, res) => {
    try {
        const updatedCoupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!updatedCoupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.status(200).json({ message: 'Coupon updated successfully', updatedCoupon });
    } catch (error) {
        res.status(500).json({ message: 'Error updating coupon', error });
    }
};

/**
 * @desc    Delete a coupon by ID
 * @route   DELETE /coupons/:id
 */
const deleteCoupon = async (req, res) => {
    try {
        const deletedCoupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!deletedCoupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting coupon', error });
    }
};

module.exports = {
    addCoupon,
    getAllCoupons,
    getCouponById,
    updateCoupon,
    deleteCoupon,
};